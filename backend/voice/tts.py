"""Offline TTS - Piper. Lazily imports heavy deps."""
from __future__ import annotations
import io
import re
import wave
from pathlib import Path
from typing import Optional

from ..core.config import DATA
from ..core.logging import get

log = get("omni.tts")

VOICES_DIR = DATA / "voices"
VOICES_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_VOICE = VOICES_DIR / "en_US-lessac-medium.onnx"

# Cache voices keyed by voice id (filename stem). Loading is cheap to amortise
# across many synthesise calls; a couple of voices in memory is fine.
_voices: dict[str, "object"] = {}


# --- Text sanitisation for speech ----------------------------------------

# Pictographic / emoji blocks. Strip rather than trying to verbalise them:
# Piper otherwise speaks the unicode name ("face with tears of joy") which
# sounds awful in a conversation.
_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001F5FF"   # symbols & pictographs
    "\U0001F600-\U0001F64F"   # emoticons
    "\U0001F680-\U0001F6FF"   # transport & map symbols
    "\U0001F700-\U0001F77F"   # alchemical
    "\U0001F780-\U0001F7FF"   # geometric shapes ext
    "\U0001F800-\U0001F8FF"   # supplemental arrows-c
    "\U0001F900-\U0001F9FF"   # supplemental symbols & pictographs
    "\U0001FA00-\U0001FA6F"   # chess / symbols ext
    "\U0001FA70-\U0001FAFF"   # symbols & pictographs ext-A
    "\U00002600-\U000026FF"   # misc symbols
    "\U00002700-\U000027BF"   # dingbats
    "\U0001F1E6-\U0001F1FF"   # regional indicators (flags)
    "‍"                  # zero-width joiner
    "️"                  # variation selector-16
    "]+",
    flags=re.UNICODE,
)

_CODE_FENCE_RE = re.compile(r"```[\s\S]*?```")
_INLINE_CODE_RE = re.compile(r"`([^`]*)`")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")          # [text](url) -> text
_BULLET_RE = re.compile(r"^\s*[-*+]\s+", flags=re.MULTILINE)
_NUMBERED_RE = re.compile(r"^\s*\d+\.\s+", flags=re.MULTILINE)
_HEADING_RE = re.compile(r"^\s*#{1,6}\s+", flags=re.MULTILINE)
_BLOCKQUOTE_RE = re.compile(r"^\s*>\s+", flags=re.MULTILINE)
_BOLD_ITALIC_RE = re.compile(r"(\*\*|__|\*|_)([^*_\n]+)\1")
_HR_RE = re.compile(r"^\s*[-*_]{3,}\s*$", flags=re.MULTILINE)
_WS_RE = re.compile(r"[ \t]+")


def _clean_for_tts(text: str) -> str:
    """Make text speakable: drop emojis, code, and markdown markers.

    Piper reads any character it gets. Unstripped emojis become spoken Unicode
    names; markdown like ``**bold**`` or ``# heading`` gets read out literally
    ("hash hash"). This collapses the text down to plain prose.
    """
    if not text:
        return ""
    t = _CODE_FENCE_RE.sub(" ", text)
    t = _INLINE_CODE_RE.sub(r"\1", t)
    t = _LINK_RE.sub(r"\1", t)
    t = _HEADING_RE.sub("", t)
    t = _BLOCKQUOTE_RE.sub("", t)
    t = _HR_RE.sub("", t)
    t = _BULLET_RE.sub("", t)
    t = _NUMBERED_RE.sub("", t)
    t = _BOLD_ITALIC_RE.sub(r"\2", t)
    t = _EMOJI_RE.sub("", t)
    # Replace any leftover lone markdown chars that didn't match a pair.
    t = t.replace("**", "").replace("__", "")
    # Soften multiple newlines to a single sentence break.
    t = re.sub(r"\n{2,}", ". ", t)
    t = t.replace("\n", " ")
    t = _WS_RE.sub(" ", t).strip()
    return t


# --- Voice loading -------------------------------------------------------


def _voice_path(voice_id: Optional[str]) -> Path:
    if not voice_id:
        return DEFAULT_VOICE
    candidate = VOICES_DIR / f"{voice_id}.onnx"
    return candidate if candidate.exists() else DEFAULT_VOICE


def _load(voice_id: Optional[str] = None):
    p = _voice_path(voice_id)
    key = p.stem
    if key in _voices:
        return _voices[key]
    from piper import PiperVoice
    if not p.exists():
        raise FileNotFoundError(
            f"Piper voice not found at {p}. Download it from Settings → Voice."
        )
    _voices[key] = PiperVoice.load(str(p))
    log.info("loaded piper voice %s", key)
    return _voices[key]


# --- Synthesis -----------------------------------------------------------


def _syn_config(rate: Optional[float] = None):
    """Build SynthesisConfig. ``rate`` (1.0 = normal, >1 = faster) maps to
    Piper's ``length_scale`` as ``1/rate``. When None, fall back to the
    saved settings.voice.rate."""
    from piper.config import SynthesisConfig
    if rate is None:
        try:
            from ..core.config import settings
            rate = float(settings.voice.rate or 1.0)
        except Exception:
            rate = 1.0
    rate = max(0.5, min(2.0, float(rate)))
    length_scale = 1.0 / rate if rate > 0 else 1.0
    return SynthesisConfig(length_scale=length_scale)


def synthesize(text: str) -> bytes:
    return synthesize_voice(text, None)


def synthesize_voice(
    text: str,
    voice_id: Optional[str],
    rate: Optional[float] = None,
) -> bytes:
    """Returns 16-bit mono PCM WAV bytes. Cleans markdown/emojis first so the
    voice doesn't read them out, and honours an optional per-call rate override.
    """
    cleaned = _clean_for_tts(text)
    if not cleaned:
        # Piper crashes on empty text; return an empty WAV header instead.
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(22050)
        return buf.getvalue()
    v = _load(voice_id)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        v.synthesize_wav(cleaned, w, syn_config=_syn_config(rate))
    return buf.getvalue()


def speak(text: str, voice_id: Optional[str] = None) -> None:
    import numpy as np
    import sounddevice as sd
    wav_bytes = synthesize_voice(text, voice_id)
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    audio = np.frombuffer(raw, dtype=np.int16)
    sd.play(audio, sr)
    sd.wait()
