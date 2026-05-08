"""Login / logout / me / change-password endpoints.

All failures during login are audit-logged (even bad attempts — with the
user_id the attacker tried so admins can detect spraying).
"""
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session as DbSession

from app.config import COOKIE_NAME
from app.models.db import Session as DbSessionRow, User, get_db
from app.models.schemas import (
    ChangePasswordIn,
    LoginIn,
    LoginResponse,
    MeResponse,
    UserOut,
)
from app.services import audit, auth

router = APIRouter()


def _user_out(u: User) -> UserOut:
    return UserOut(
        user_id=u.user_id,
        display_name=u.display_name,
        department=u.department,
        role=u.role,
        is_active=u.is_active,
        must_change_password=u.must_change_password,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


def _err(code: str, message: str, status: int = 400):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginIn, request: Request, response: Response, db: DbSession = Depends(get_db)):
    user_id = (body.user_id or "").strip()
    if not user_id or not body.password:
        return _err("INVALID_INPUT", "请输入用户名和密码")

    remaining = auth.is_locked_out(db, user_id)
    if remaining:
        audit.log_event(
            user_id=user_id, action="login", resource_type="user",
            resource_id=user_id, request=request, success=False,
            detail={"reason": "locked", "remaining_seconds": remaining},
        )
        return _err("LOCKED", f"登录失败次数过多，请 {max(1, remaining // 60)} 分钟后再试", 429)

    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None or not auth.verify_password(body.password, user.password_hash):
        auth.record_login_attempt(db, user_id, request.client.host if request.client else "", success=False)
        audit.log_event(
            user_id=user_id, action="login", resource_type="user",
            resource_id=user_id, request=request, success=False,
            detail={"reason": "invalid_credentials"},
        )
        return _err("INVALID_CREDENTIALS", "用户名或密码错误", 401)

    if not user.is_active:
        audit.log_event(
            user_id=user_id, action="login", resource_type="user",
            resource_id=user_id, request=request, success=False,
            detail={"reason": "disabled"},
        )
        return _err("USER_DISABLED", "账号已被禁用", 403)

    auth.record_login_attempt(db, user_id, request.client.host if request.client else "", success=True)
    sess = auth.create_session(db, user, request)
    user.last_login_at = datetime.utcnow()
    db.commit()
    auth.set_session_cookie(response, sess.session_id)
    audit.log_event(
        user_id=user_id, action="login", resource_type="user",
        resource_id=user_id, request=request, success=True,
    )
    return LoginResponse(user=_user_out(user))


@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    session_id: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: DbSession = Depends(get_db),
):
    user_id_for_audit = None
    if session_id:
        sess = db.query(DbSessionRow).filter(DbSessionRow.session_id == session_id).first()
        if sess:
            user_id_for_audit = sess.user_id
        auth.destroy_session(db, session_id)
    auth.clear_session_cookie(response)
    audit.log_event(
        user_id=user_id_for_audit, action="logout", resource_type="user",
        resource_id=user_id_for_audit or "", request=request,
    )
    return {"ok": True}


@router.get("/auth/me", response_model=MeResponse)
async def me(user: User = Depends(auth.require_user)):
    return MeResponse(user=_user_out(user))


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordIn,
    request: Request,
    user: User = Depends(auth.require_user),
    db: DbSession = Depends(get_db),
):
    if not auth.verify_password(body.current_password, user.password_hash):
        audit.log_event(
            user_id=user.user_id, action="change_password", resource_type="user",
            resource_id=user.user_id, request=request, success=False,
            detail={"reason": "current_password_wrong"},
        )
        return _err("INVALID_CREDENTIALS", "当前密码不正确", 401)

    err = auth.validate_password_strength(body.new_password)
    if err:
        return _err("WEAK_PASSWORD", err)
    if body.new_password == body.current_password:
        return _err("SAME_PASSWORD", "新密码不能与当前密码相同")

    user.password_hash = auth.hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    audit.log_event(
        user_id=user.user_id, action="change_password", resource_type="user",
        resource_id=user.user_id, request=request, success=True,
    )
    return {"ok": True}
