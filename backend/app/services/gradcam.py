import numpy as np
from PIL import Image
from pathlib import Path
from datetime import datetime, timezone
import secrets

from app.config import GRADCAM_DIR


def generate_placeholder_gradcam(case_id: str) -> str:
    arr = np.zeros((224, 224, 3), dtype=np.uint8)
    for y in range(224):
        for x in range(224):
            arr[y, x, 0] = int(255 * y / 223)
            arr[y, x, 1] = int(255 * (1 - y / 223) * x / 223)
            arr[y, x, 2] = 50

    img = Image.fromarray(arr)

    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y/%m/%d")
    dest_dir = GRADCAM_DIR / date_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{case_id}_{secrets.token_hex(4)}.png"
    dest_path = dest_dir / filename
    img.save(dest_path, "PNG")

    return f"gradcam/{date_dir}/{filename}"
