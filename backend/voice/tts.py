"""Offline TTS - Piper. Lazily imports heavy deps."""
from __future__ import annotations
import io
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
            f"Piper voice not found at {p}. Download .onnx + .onnx.json from "
            "https://github.com/rhasspy/piper/blob/master/VOICES.md and place "
            f"them in {VOICES_DIR}."
        )
    _voices[key] = PiperVoice.load(str(p))
    log.info("loaded piper voice %s", key)
    return _voices[key]


def synthesize(text: str) -> bytes:
    return synthesize_voice(text, None)


def _syn_config():
    """Build SynthesisConfig from settings. rate>1 → faster speech (Piper's
    length_scale is inverse of rate)."""
    from piper.config import SynthesisConfig
    try:
        from ..core.config import settings
        rate = float(settings.voice.rate or 1.0)
    except Exception:
        rate = 1.0
    length_scale = 1.0 / rate if rate > 0 else 1.0
    return SynthesisConfig(length_scale=length_scale)


def synthesize_voice(text: str, voice_id: Optional[str]) -> bytes:
    """Returns 16-bit mono PCM WAV bytes for the requested voice (or default).

    Piper 1.4.x API: use ``synthesize_wav`` with a SynthesisConfig.
    """
    v = _load(voice_id)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        v.synthesize_wav(text, w, syn_config=_syn_config())
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
