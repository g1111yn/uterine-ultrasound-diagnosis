#!/usr/bin/env python3
"""Create or reset an admin account.

Usage:
    python scripts/init_admin.py --user-id admin --password 'initial-pass'
    python scripts/init_admin.py --user-id admin --password 'new-pass' --reset

The new admin is created with must_change_password=True, so the operator
should log in and change it immediately via /api/auth/change-password.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.db import SessionLocal, User, init_schema  # noqa: E402
from app.services.auth import hash_password, validate_password_strength  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--user-id", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--display-name", default="系统管理员")
    p.add_argument("--department", default="信息科")
    p.add_argument("--reset", action="store_true", help="Reset password if user exists")
    args = p.parse_args()

    err = validate_password_strength(args.password)
    if err:
        print(f"[error] 密码不符合要求: {err}", file=sys.stderr)
        return 2

    init_schema()
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.user_id == args.user_id).first()
        if existing:
            if not args.reset:
                print(
                    f"[error] 用户 {args.user_id} 已存在。传入 --reset 可重置密码并设为管理员。",
                    file=sys.stderr,
                )
                return 3
            existing.password_hash = hash_password(args.password)
            existing.role = "admin"
            existing.is_active = True
            existing.must_change_password = True
            db.commit()
            print(f"[ok] 已重置管理员账号 {args.user_id}，请登录后立刻修改密码。")
            return 0

        user = User(
            user_id=args.user_id,
            display_name=args.display_name,
            department=args.department,
            password_hash=hash_password(args.password),
            role="admin",
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"[ok] 已创建管理员账号 {args.user_id}，请登录后立刻修改密码。")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
