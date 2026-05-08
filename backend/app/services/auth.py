"""Authentication service: password hashing, session lifecycle, login
attempt tracking, and FastAPI dependencies for role-based access.

Sessions are stored in the database so they survive restarts and can be
invalidated server-side. The session_id cookie is HttpOnly + SameSite=Lax
(secure flag controlled by env, see config.COOKIE_SECURE).
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session as DbSession

from app.config import (
    COOKIE_NAME,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    LOGIN_FAILURE_LIMIT,
    LOGIN_LOCKOUT_MINUTES,
    PASSWORD_MIN_LENGTH,
    SESSION_LIFETIME_HOURS,
)
from app.models.db import LoginAttempt, Session, User, get_db

# -- Password hashing --------------------------------------------------------


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed or hashed.startswith("!"):
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


_PW_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).+$")


def validate_password_strength(password: str) -> Optional[str]:
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"密码至少 {PASSWORD_MIN_LENGTH} 位"
    if not _PW_RE.match(password):
        return "密码必须包含字母和数字"
    return None


# -- Login attempt tracking --------------------------------------------------


def is_locked_out(db: DbSession, user_id: str) -> Optional[int]:
    """Return seconds remaining in the lockout window, or None."""
    if LOGIN_FAILURE_LIMIT <= 0:
        return None
    window_start = datetime.utcnow() - timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    recent = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.user_id == user_id,
            LoginAttempt.attempted_at >= window_start,
            LoginAttempt.success.is_(False),
        )
        .order_by(LoginAttempt.attempted_at.desc())
        .limit(LOGIN_FAILURE_LIMIT)
        .all()
    )
    if len(recent) < LOGIN_FAILURE_LIMIT:
        return None
    oldest = recent[-1].attempted_at
    unlock_at = oldest + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    remaining = int((unlock_at - datetime.utcnow()).total_seconds())
    return max(remaining, 0) if remaining > 0 else None


def record_login_attempt(db: DbSession, user_id: str, ip: str, success: bool):
    db.add(LoginAttempt(
        user_id=user_id,
        ip_address=ip or "",
        success=success,
        attempted_at=datetime.utcnow(),
    ))
    db.commit()


# -- Session lifecycle -------------------------------------------------------


def create_session(db: DbSession, user: User, request: Request) -> Session:
    sid = secrets.token_hex(32)
    now = datetime.utcnow()
    sess = Session(
        session_id=sid,
        user_id=user.user_id,
        created_at=now,
        expires_at=now + timedelta(hours=SESSION_LIFETIME_HOURS),
        last_active_at=now,
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("User-Agent") or "")[:500],
    )
    db.add(sess)
    db.commit()
    return sess


def destroy_session(db: DbSession, session_id: str):
    if not session_id:
        return
    db.query(Session).filter(Session.session_id == session_id).delete()
    db.commit()


def touch_session(db: DbSession, sess: Session):
    now = datetime.utcnow()
    sess.last_active_at = now
    sess.expires_at = now + timedelta(hours=SESSION_LIFETIME_HOURS)
    db.commit()


def set_session_cookie(response: Response, session_id: str):
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        max_age=SESSION_LIFETIME_HOURS * 3600,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def clear_session_cookie(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return (request.client.host if request.client else "") or ""


# -- FastAPI dependencies ----------------------------------------------------


class _AuthError(HTTPException):
    def __init__(self, code: str, message: str, status_code: int = 401):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


def get_current_session(
    request: Request,
    session_id: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: DbSession = Depends(get_db),
) -> Session:
    if not session_id:
        raise _AuthError("UNAUTHORIZED", "需要登录")
    sess = db.query(Session).filter(Session.session_id == session_id).first()
    if not sess:
        raise _AuthError("UNAUTHORIZED", "会话不存在或已失效")
    if sess.expires_at < datetime.utcnow():
        db.delete(sess)
        db.commit()
        raise _AuthError("SESSION_EXPIRED", "会话已过期，请重新登录")
    # Sliding expiration.
    touch_session(db, sess)
    return sess


def require_user(
    sess: Session = Depends(get_current_session),
    db: DbSession = Depends(get_db),
) -> User:
    user = db.query(User).filter(User.user_id == sess.user_id).first()
    if not user or not user.is_active:
        raise _AuthError("USER_DISABLED", "账号已被禁用", status_code=403)
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if user.role != "admin":
        raise _AuthError("FORBIDDEN", "需要管理员权限", status_code=403)
    return user


def optional_user(
    request: Request,
    session_id: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: DbSession = Depends(get_db),
) -> Optional[User]:
    """Resolve the current user if a valid session cookie is present, else
    return None without raising. Useful for endpoints that vary behavior by
    auth state but don't require it."""
    if not session_id:
        return None
    sess = db.query(Session).filter(Session.session_id == session_id).first()
    if not sess or sess.expires_at < datetime.utcnow():
        return None
    user = db.query(User).filter(User.user_id == sess.user_id).first()
    if not user or not user.is_active:
        return None
    touch_session(db, sess)
    return user
