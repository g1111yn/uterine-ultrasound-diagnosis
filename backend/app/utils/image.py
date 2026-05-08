from PIL import Image
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone

import numpy as np

from app.config import UPLOAD_DIR, PREVIEW_DIR


# Extensions we accept on upload. Kept here so ``sniff_image_mime`` and the
# route handler agree on the whitelist.
_EXT_TO_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "bmp": "image/bmp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "dcm": "application/dicom",
}


def sniff_image_mime(content: bytes, filename: str) -> str:
    """Best-effort MIME detection: real bytes first, extension as fallback.

    - DICOM is detected via the 132-byte preamble + ``DICM`` magic (``filetype``
      doesn't know the DICOM format).
    - Everything else goes through the ``filetype`` library, which reads the
      first few bytes; unknown content falls back to the mapping from the
      filename extension.
    - If nothing matches, returns ``"application/octet-stream"`` so the caller
      can reject the upload safely.
    """
    if len(content) >= 132 and content[128:132] == b"DICM":
        return "application/dicom"

    try:
        import filetype  # type: ignore
        guess = filetype.guess(content)
        if guess is not None and guess.mime:
            return guess.mime
    except Exception:
        # ``filetype`` is pure Python and should not fail, but we keep this
        # defensive: if anything goes wrong we continue to the ext fallback.
        pass

    ext = Path(filename or "").suffix.lower().lstrip(".")
    return _EXT_TO_MIME.get(ext, "application/octet-stream")


def save_upload(content: bytes, filename: str) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    date_dir = now.strftime("%Y/%m/%d")
    dest_dir = UPLOAD_DIR / date_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in ("jpg", "jpeg", "png", "dcm", "bmp"):
        ext = "jpg"

    import secrets
    safe_name = secrets.token_hex(8) + "." + ext
    dest_path = dest_dir / safe_name
    dest_path.write_bytes(content)

    rel_path = f"uploads/{date_dir}/{safe_name}"
    fmt = "jpg" if ext in ("jpg", "jpeg") else ext
    return rel_path, fmt


def _is_dicom_bytes(content: bytes) -> bool:
    # DICOM files have a 128-byte preamble followed by the magic bytes 'DICM'
    return len(content) >= 132 and content[128:132] == b"DICM"


def decode_dicom(content: bytes) -> Image.Image:
    """Decode a DICOM byte buffer into a PIL RGB image.

    Applies window center/width when present, otherwise uses min-max
    normalization. Handles MONOCHROME1 by inverting the grayscale.
    Raises ValueError on decode failure or unsupported pixel data.
    """
    try:
        import pydicom
    except ImportError as exc:  # pragma: no cover - dependency install guard
        raise ValueError(f"pydicom is required to decode DICOM images: {exc}") from exc

    try:
        ds = pydicom.dcmread(BytesIO(content), force=True)
    except Exception as exc:
        raise ValueError(f"Failed to read DICOM dataset: {exc}") from exc

    try:
        arr = ds.pixel_array
    except Exception as exc:
        raise ValueError(f"Failed to decode DICOM pixel data: {exc}") from exc

    if arr is None or arr.size == 0:
        raise ValueError("DICOM pixel array is empty.")

    # Multi-frame: take the first frame for a preview.
    if arr.ndim == 4:
        arr = arr[0]
    elif arr.ndim == 3 and getattr(ds, "SamplesPerPixel", 1) == 1:
        # grayscale multi-frame (frames, H, W)
        arr = arr[0]

    arr = np.asarray(arr)

    # Apply rescale slope/intercept if present
    slope = float(getattr(ds, "RescaleSlope", 1) or 1)
    intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
    if slope != 1 or intercept != 0:
        arr = arr.astype(np.float32) * slope + intercept

    photometric = str(getattr(ds, "PhotometricInterpretation", "") or "").upper()

    # Color (RGB/YBR) path
    if arr.ndim == 3 and arr.shape[-1] in (3, 4):
        # Normalize color sample to uint8
        a = arr.astype(np.float32)
        if a.max() > 0:
            if a.max() > 255:
                a = a / a.max() * 255.0
        a = np.clip(a, 0, 255).astype(np.uint8)
        if a.shape[-1] == 4:
            a = a[..., :3]
        pil = Image.fromarray(a, mode="RGB")
        return pil

    # Grayscale path — apply window if present
    wc = getattr(ds, "WindowCenter", None)
    ww = getattr(ds, "WindowWidth", None)
    if isinstance(wc, (list, tuple)) and len(wc) > 0:
        wc = wc[0]
    if isinstance(ww, (list, tuple)) and len(ww) > 0:
        ww = ww[0]

    a = arr.astype(np.float32)
    try:
        wc_f = float(wc) if wc is not None else None
        ww_f = float(ww) if ww is not None else None
    except (TypeError, ValueError):
        wc_f = None
        ww_f = None

    if wc_f is not None and ww_f is not None and ww_f > 0:
        low = wc_f - ww_f / 2.0
        high = wc_f + ww_f / 2.0
        a = np.clip(a, low, high)
        if high > low:
            a = (a - low) / (high - low) * 255.0
        else:
            a = np.zeros_like(a)
    else:
        a_min = float(a.min())
        a_max = float(a.max())
        if a_max > a_min:
            a = (a - a_min) / (a_max - a_min) * 255.0
        else:
            a = np.zeros_like(a)

    a = np.clip(a, 0, 255).astype(np.uint8)

    if photometric == "MONOCHROME1":
        a = 255 - a

    pil = Image.fromarray(a, mode="L").convert("RGB")
    return pil


def load_image_bytes(content: bytes, filename: str | None = None) -> Image.Image:
    """Decode an image byte buffer into a PIL RGB image.

    If the filename ends with .dcm or the bytes look like a DICOM file,
    decode via pydicom with window leveling; otherwise fall back to PIL.
    The filename argument is optional for backward compatibility.
    """
    name = (filename or "").lower()
    if name.endswith(".dcm") or _is_dicom_bytes(content):
        return decode_dicom(content)
    return Image.open(BytesIO(content)).convert("RGB")


def save_upload_with_preview(content: bytes, filename: str) -> tuple[str, str, str]:
    """Save the original upload and, for DICOM inputs, also a PNG preview.

    Returns a tuple (image_path, image_format, preview_path) where paths
    are relative to DATA_DIR. For non-DICOM uploads, preview_path equals
    image_path (the upload itself is renderable by browsers). For DICOM,
    a PNG preview is written under data/previews/<date>/<name>.png. On
    DICOM decode failure, preview_path is returned as an empty string
    and the caller may surface a user-facing error.
    """
    image_path, fmt = save_upload(content, filename)

    if fmt != "dcm":
        return image_path, fmt, image_path

    # image_path looks like uploads/<date>/<hex>.dcm — mirror that layout
    # under previews/ so files stay correlated.
    rel = Path(image_path)
    # parts: ('uploads', 'YYYY', 'MM', 'DD', '<hex>.dcm')
    parts = rel.parts
    if len(parts) >= 2 and parts[0] == "uploads":
        date_parts = parts[1:-1]
    else:
        date_parts = ()
    safe_stem = Path(parts[-1]).stem
    preview_dir = PREVIEW_DIR.joinpath(*date_parts)
    preview_dir.mkdir(parents=True, exist_ok=True)
    preview_file = preview_dir / f"{safe_stem}.png"

    try:
        pil = decode_dicom(content)
        pil.save(preview_file, format="PNG")
    except ValueError:
        # Preview generation failed; keep the original file but signal no preview.
        return image_path, fmt, ""

    if date_parts:
        preview_rel = "previews/" + "/".join(date_parts) + f"/{safe_stem}.png"
    else:
        preview_rel = f"previews/{safe_stem}.png"
    return image_path, fmt, preview_rel
