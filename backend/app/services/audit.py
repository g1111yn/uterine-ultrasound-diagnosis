"""Append-only audit logging.

log_event commits in its own transaction so audit never depends on the
caller's business transaction — a rollback in the business path must not
erase the audit trail, and a failed audit write should never block a
successful business operation.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from fastapi import Request

from app.models.db import AuditLog, SessionLocal


def _client_ip(request: Optional[Request]) -> str:
    if request is None:
        return ""
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return (request.client.host if request.client else "") or ""


def _ua(request: Optional[Request]) -> str:
    if request is None:
        return ""
    return (request.headers.get("User-Agent") or "")[:500]


def log_event(
    *,
    user_id: Optional[str],
    action: str,
    resource_type: str = "",
    resource_id: str = "",
    request: Optional[Request] = None,
    detail: Optional[dict[str, Any]] = None,
    success: bool = True,
) -> None:
    db = SessionLocal()
    try:
        db.add(AuditLog(
            timestamp=datetime.utcnow(),
            user_id=user_id,
            action=action,
            resource_type=resource_type or "",
            resource_id=resource_id or "",
            ip_address=_client_ip(request),
            user_agent=_ua(request),
            detail=json.dumps(detail or {}, ensure_ascii=False),
            success=success,
        ))
        db.commit()
    except Exception as exc:
        # Audit write failure is logged but never propagates.
        print(f"[audit] write failed: {exc}")
        db.rollback()
    finally:
        db.close()
