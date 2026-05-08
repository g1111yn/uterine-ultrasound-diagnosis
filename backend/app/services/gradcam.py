"""Grad-CAM helpers.

Real Grad-CAM generation now happens inside RealInferencer.predict() so the
overlay can reuse the same image tensor and text embedding that drove the
prediction. This module keeps a small fallback used when predict() could
not produce an overlay (e.g. the caller wants to backfill a case).
"""

import secrets
from datetime import datetime, timezone

from PIL import Image
import numpy as np

from app.config import GRADCAM_DIR


def generate_placeholder_gradcam(case_id: str) -> str:
    """Fallback overlay writer — a simple gradient PNG.

    Kept for backwards compatibility with any pathway that still expects
    a gradcam file to exist even when RealInferencer did not produce one.
    Returns a path relative to DATA_DIR.
    """
    arr = np.zeros((224, 224, 3), dtype=np.uint8)
    ys = np.arange(224, dtype=np.float32)[:, None] / 223.0
    xs = np.arange(224, dtype=np.float32)[None, :] / 223.0
    arr[..., 0] = (255 * ys).astype(np.uint8)
    arr[..., 1] = (255 * (1 - ys) * xs).astype(np.uint8)
    arr[..., 2] = 50
    img = Image.fromarray(arr)

    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y/%m/%d")
    dest_dir = GRADCAM_DIR / date_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{case_id}_{secrets.token_hex(4)}.png"
    dest_path = dest_dir / filename
    img.save(dest_path, "PNG")

    return f"gradcam/{date_dir}/{filename}"
