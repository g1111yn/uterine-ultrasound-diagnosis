import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PREVIEW_DIR = DATA_DIR / "previews"
GRADCAM_DIR = DATA_DIR / "gradcam"
CHECKPOINT_DIR = BASE_DIR / "checkpoints"

DATABASE_URL = f"sqlite:///{BASE_DIR / 'data' / 'app.db'}"

MODEL_VERSION = "resnet18-ernie-health-v1.0"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
]

for d in (UPLOAD_DIR, PREVIEW_DIR, GRADCAM_DIR, CHECKPOINT_DIR):
    d.mkdir(parents=True, exist_ok=True)
