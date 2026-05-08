import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PREVIEW_DIR = DATA_DIR / "previews"
GRADCAM_DIR = DATA_DIR / "gradcam"
CHECKPOINT_DIR = BASE_DIR / "checkpoints"
BATCH_DIR = DATA_DIR / "batch"

DATABASE_URL = f"sqlite:///{BASE_DIR / 'data' / 'app.db'}"

MODEL_VERSION = "resnet18-bert-chinese-v1-mini"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]

for d in (UPLOAD_DIR, PREVIEW_DIR, GRADCAM_DIR, CHECKPOINT_DIR, BATCH_DIR):
    d.mkdir(parents=True, exist_ok=True)

HOME = Path(os.path.expanduser("~"))
MODEL_CKPT_PATH = Path(os.getenv(
    "MODEL_CKPT_PATH",
    HOME / "Documents" / "超声" / "checkpoints" / "bert-base_fold1_best.pth"
))
BERT_PATH = Path(os.getenv(
    "BERT_PATH",
    HOME / "Documents" / "超声" / "models" / "tiansz" / "bert-base-chinese"
))


# -- Security / session configuration ---------------------------------------

def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "session_id")
COOKIE_SECURE = _env_bool("COOKIE_SECURE", False)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
SESSION_LIFETIME_HOURS = int(os.getenv("SESSION_LIFETIME_HOURS", "8"))

HSTS_ENABLED = _env_bool("HSTS_ENABLED", False)
FORCE_HTTPS_REDIRECT = _env_bool("FORCE_HTTPS_REDIRECT", False)

LOGIN_FAILURE_LIMIT = int(os.getenv("LOGIN_FAILURE_LIMIT", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))

PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
