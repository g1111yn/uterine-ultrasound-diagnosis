"""Admin endpoints: user management + audit log query + CSV export.

All routes require role == admin (enforced by dependency).
"""
from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session as DbSession

from app.models.db import AuditLog, User, get_db
from app.models.schemas import (
    AdminUserCreateIn,
    AdminUserListResponse,
    AdminUserUpdateIn,
    AuditLogItem,
    AuditLogListResponse,
    UserOut,
)
from app.services import audit, auth

router = APIRouter()

VALID_ROLES = {"doctor", "admin"}


def _err(code: str, message: str, status: int = 400):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


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


# -- Users -------------------------------------------------------------------


@router.get("/admin/users", response_model=AdminUserListResponse)
async def list_users(
    db: DbSession = Depends(get_db),
    _admin: User = Depends(auth.require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return AdminUserListResponse(total=len(users), items=[_user_out(u) for u in users])


@router.post("/admin/users", response_model=UserOut, status_code=201)
async def create_user(
    body: AdminUserCreateIn,
    request: Request,
    db: DbSession = Depends(get_db),
    admin: User = Depends(auth.require_admin),
):
    uid = (body.user_id or "").strip()
    if not uid or not uid.replace("_", "").replace("-", "").isalnum():
        return _err("INVALID_USER_ID", "用户名只能包含字母、数字、下划线、短横线")
    if body.role not in VALID_ROLES:
        return _err("INVALID_ROLE", f"角色必须是 {sorted(VALID_ROLES)}")
    if db.query(User).filter(User.user_id == uid).first():
        return _err("USER_EXISTS", f"用户 {uid} 已存在", 409)

    err = auth.validate_password_strength(body.password)
    if err:
        return _err("WEAK_PASSWORD", err)

    user = User(
        user_id=uid,
        display_name=(body.display_name or "").strip() or uid,
        department=(body.department or "").strip(),
        password_hash=auth.hash_password(body.password),
        role=body.role,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    audit.log_event(
        user_id=admin.user_id, action="create_user", resource_type="user",
        resource_id=uid, request=request,
        detail={"role": body.role, "display_name": user.display_name},
    )
    return _user_out(user)


@router.patch("/admin/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: AdminUserUpdateIn,
    request: Request,
    db: DbSession = Depends(get_db),
    admin: User = Depends(auth.require_admin),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        return _err("NOT_FOUND", f"用户 {user_id} 不存在", 404)

    changes: dict = {}
    if body.display_name is not None and body.display_name != user.display_name:
        changes["display_name"] = {"from": user.display_name, "to": body.display_name}
        user.display_name = body.display_name
    if body.department is not None and body.department != user.department:
        changes["department"] = {"from": user.department, "to": body.department}
        user.department = body.department
    if body.role is not None and body.role != user.role:
        if body.role not in VALID_ROLES:
            return _err("INVALID_ROLE", f"角色必须是 {sorted(VALID_ROLES)}")
        # Prevent demoting the last remaining admin.
        if user.role == "admin" and body.role != "admin":
            remaining = (
                db.query(User)
                .filter(User.role == "admin", User.is_active.is_(True), User.user_id != user_id)
                .count()
            )
            if remaining == 0:
                return _err("LAST_ADMIN", "不能降级最后一个管理员")
        changes["role"] = {"from": user.role, "to": body.role}
        user.role = body.role
    if body.is_active is not None and body.is_active != user.is_active:
        if user.role == "admin" and not body.is_active:
            remaining = (
                db.query(User)
                .filter(User.role == "admin", User.is_active.is_(True), User.user_id != user_id)
                .count()
            )
            if remaining == 0:
                return _err("LAST_ADMIN", "不能禁用最后一个管理员")
        changes["is_active"] = {"from": user.is_active, "to": body.is_active}
        user.is_active = body.is_active
    if body.new_password is not None:
        err = auth.validate_password_strength(body.new_password)
        if err:
            return _err("WEAK_PASSWORD", err)
        user.password_hash = auth.hash_password(body.new_password)
        user.must_change_password = True
        changes["password_reset"] = True
    if body.force_password_change is not None:
        user.must_change_password = bool(body.force_password_change)
        changes["must_change_password"] = user.must_change_password

    db.commit()
    audit.log_event(
        user_id=admin.user_id, action="update_user", resource_type="user",
        resource_id=user_id, request=request, detail=changes,
    )
    return _user_out(user)


# -- Audit logs --------------------------------------------------------------


def _build_audit_query(
    db: DbSession,
    user_id: Optional[str],
    action: Optional[str],
    success: Optional[bool],
    date_from: Optional[str],
    date_to: Optional[str],
):
    q = db.query(AuditLog)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    if success is not None:
        q = q.filter(AuditLog.success.is_(success))
    if date_from:
        try:
            q = q.filter(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except ValueError:
            pass
    return q


@router.get("/admin/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: DbSession = Depends(get_db),
    _admin: User = Depends(auth.require_admin),
):
    q = _build_audit_query(db, user_id, action, success, date_from, date_to)
    total = q.count()
    rows = (
        q.order_by(AuditLog.timestamp.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return AuditLogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[
            AuditLogItem(
                id=r.id,
                timestamp=r.timestamp,
                user_id=r.user_id,
                action=r.action,
                resource_type=r.resource_type,
                resource_id=r.resource_id,
                ip_address=r.ip_address,
                success=r.success,
                detail=r.detail or "",
            )
            for r in rows
        ],
    )


@router.get("/admin/audit-logs.csv")
async def export_audit_logs_csv(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: DbSession = Depends(get_db),
    _admin: User = Depends(auth.require_admin),
):
    q = _build_audit_query(db, user_id, action, success, date_from, date_to).order_by(AuditLog.timestamp.desc())
    rows = q.all()
    buf = io.StringIO()
    # BOM for Excel Chinese compatibility.
    buf.write("﻿")
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "user_id", "action", "resource_type", "resource_id", "ip", "success", "detail"])
    for r in rows:
        writer.writerow([
            r.timestamp.isoformat(timespec="seconds"),
            r.user_id or "",
            r.action,
            r.resource_type,
            r.resource_id,
            r.ip_address,
            "1" if r.success else "0",
            (r.detail or "").replace("\n", " "),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.read()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit-logs.csv"'},
    )
