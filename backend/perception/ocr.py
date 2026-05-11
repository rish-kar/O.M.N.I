"""Optional OCR fallback. Requires Tesseract installed; falls back to empty."""
from __future__ import annotations
from PIL import Image
from ..core.logging import get

log = get("omni.ocr")

try:
    import pytesseract  # noqa: F401
    _HAS = True
except Exception:
    _HAS = False


def text(img: Image.Image) -> str:
    if not _HAS:
        return ""
    try:
        import pytesseract
        return pytesseract.image_to_string(img)
    except Exception as e:
        log.warning("ocr failed: %s", e)
        return ""
