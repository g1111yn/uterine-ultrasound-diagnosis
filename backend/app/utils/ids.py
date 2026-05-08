import secrets
from datetime import datetime, timezone


def generate_case_id() -> str:
    now = datetime.now(timezone.utc)
    hex_part = secrets.token_hex(2)
    return f"{now.strftime('%Y%m%d-%H%M')}-{hex_part}"


def generate_batch_id() -> str:
    now = datetime.now(timezone.utc)
    hex_part = secrets.token_hex(2)
    return f"batch-{now.strftime('%Y%m%d-%H%M')}-{hex_part}"


def generate_task_id(prefix: str = "task") -> str:
    return f"{prefix}-{secrets.token_hex(6)}"

