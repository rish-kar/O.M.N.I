"""Curated Piper voice catalog + downloader.

Voices live under data/voices as ``{voice_id}.onnx`` plus ``{voice_id}.onnx.json``.
URLs follow the rhasspy/piper-voices HuggingFace layout:

    https://huggingface.co/rhasspy/piper-voices/resolve/main/
        {lang}/{locale}/{name}/{quality}/{voice_id}.onnx

where voice_id is ``{locale}-{name}-{quality}``.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional
import urllib.request
import urllib.error

from ..core.logging import get
from .tts import VOICES_DIR

log = get("omni.voice.catalog")


# Curated list - keep small so the UI is browsable. All English for now.
CATALOG: dict[str, dict] = {
    "en_US-lessac-medium": {
        "label": "Lessac",
        "locale": "en_US",
        "gender": "female",
        "quality": "medium",
        "notes": "Clear, neutral US accent - the default.",
    },
    "en_US-amy-medium": {
        "label": "Amy",
        "locale": "en_US",
        "gender": "female",
        "quality": "medium",
        "notes": "Warm, conversational US female.",
    },
    "en_US-hfc_female-medium": {
        "label": "HFC Female",
        "locale": "en_US",
        "gender": "female",
        "quality": "medium",
        "notes": "Bright, energetic US female.",
    },
    "en_US-hfc_male-medium": {
        "label": "HFC Male",
        "locale": "en_US",
        "gender": "male",
        "quality": "medium",
        "notes": "Calm, low-pitched US male.",
    },
    "en_US-ryan-high": {
        "label": "Ryan (HQ)",
        "locale": "en_US",
        "gender": "male",
        "quality": "high",
        "notes": "High-quality US male - slowest to load.",
    },
    "en_US-libritts_r-medium": {
        "label": "LibriTTS Multi",
        "locale": "en_US",
        "gender": "mixed",
        "quality": "medium",
        "notes": "Multi-speaker; picks a US voice automatically.",
    },
    "en_GB-alan-medium": {
        "label": "Alan",
        "locale": "en_GB",
        "gender": "male",
        "quality": "medium",
        "notes": "UK male, Received Pronunciation.",
    },
    "en_GB-jenny_dioco-medium": {
        "label": "Jenny",
        "locale": "en_GB",
        "gender": "female",
        "quality": "medium",
        "notes": "UK female, soft and natural.",
    },
    "en_GB-southern_english_female-low": {
        "label": "Southern English (small)",
        "locale": "en_GB",
        "gender": "female",
        "quality": "low",
        "notes": "Tiny file (~25 MB), faster on low-end machines.",
    },
}


def _parts(voice_id: str) -> tuple[str, str, str, str]:
    """``en_US-amy-medium`` → ('en', 'en_US', 'amy', 'medium')."""
    locale, name, quality = voice_id.split("-", 2)
    lang = locale.split("_")[0]
    return lang, locale, name, quality


def piper_urls(voice_id: str) -> tuple[str, str]:
    """Return (onnx_url, onnx_json_url) for the given voice id."""
    lang, locale, name, quality = _parts(voice_id)
    base = (
        f"https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        f"{lang}/{locale}/{name}/{quality}/{voice_id}"
    )
    return base + ".onnx", base + ".onnx.json"


def is_installed(voice_id: str) -> bool:
    return (VOICES_DIR / f"{voice_id}.onnx").exists() \
        and (VOICES_DIR / f"{voice_id}.onnx.json").exists()


def list_catalog() -> list[dict]:
    """Catalog entries, each annotated with installed/url info."""
    out = []
    for vid, meta in CATALOG.items():
        url_onnx, url_json = piper_urls(vid)
        out.append({
            "id": vid,
            "label": meta["label"],
            "locale": meta["locale"],
            "gender": meta["gender"],
            "quality": meta["quality"],
            "notes": meta["notes"],
            "installed": is_installed(vid),
            "url": url_onnx,
            "url_json": url_json,
        })
    return out


def _download_to(url: str, dest: Path) -> int:
    """Streaming download with a User-Agent so HF doesn't 403 us. Returns
    the bytes written; atomic via a .part suffix."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "omni-voice/1.0"})
    written = 0
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(64 * 1024)
            if not chunk:
                break
            f.write(chunk)
            written += len(chunk)
    tmp.replace(dest)
    return written


class VoiceDownloadError(Exception):
    pass


def download(voice_id: str) -> dict:
    if voice_id not in CATALOG:
        raise VoiceDownloadError(f"Unknown voice id: {voice_id}")
    onnx_url, json_url = piper_urls(voice_id)
    onnx_dest = VOICES_DIR / f"{voice_id}.onnx"
    json_dest = VOICES_DIR / f"{voice_id}.onnx.json"
    try:
        onnx_bytes = _download_to(onnx_url, onnx_dest)
        json_bytes = _download_to(json_url, json_dest)
    except urllib.error.HTTPError as e:
        raise VoiceDownloadError(
            f"Couldn't download {voice_id} ({e.code} from {e.url}). "
            "Check your internet connection and try again."
        ) from e
    except Exception as e:
        raise VoiceDownloadError(f"Download failed: {e}") from e
    log.info("downloaded voice %s (%d + %d bytes)", voice_id, onnx_bytes, json_bytes)
    return {
        "id": voice_id,
        "onnx_bytes": onnx_bytes,
        "json_bytes": json_bytes,
    }


def delete(voice_id: str) -> bool:
    """Remove a downloaded voice. Default voice can't be deleted."""
    if voice_id == "en_US-lessac-medium":
        return False
    removed = False
    for ext in (".onnx", ".onnx.json"):
        p = VOICES_DIR / f"{voice_id}{ext}"
        if p.exists():
            p.unlink()
            removed = True
    return removed
