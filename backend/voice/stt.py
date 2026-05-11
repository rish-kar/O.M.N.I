"""Offline STT - faster-whisper with CUDA when available, CPU fallback otherwise.

Heavy deps (numpy, sounddevice, faster_whisper, onnxruntime) are imported
lazily so the backend keeps starting even when voice deps are not installed.
"""
from __future__ import annotations
import io
import wave
from typing import Optional

from ..core.logging import get

log = get("omni.stt")

_model = None        # lazy-loaded WhisperModel
_model_device = None # "cuda" or "cpu" — track so we can demote on failure


def _has_onnxruntime() -> bool:
    """faster-whisper's vad_filter relies on onnxruntime. If it is missing
    we silently disable VAD so transcription still works."""
    try:
        import onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


_VAD_OK = _has_onnxruntime()


def _is_cuda_runtime_error(e: BaseException) -> bool:
    """Catch the family of errors raised when CUDA libs (cuBLAS, cuDNN, ctranslate2)
    fail to load or run at inference time on a machine that lacks the right DLLs."""
    msg = str(e).lower()
    return any(
        token in msg
        for token in (
            "cublas", "cudnn", "cuda", "cudart", "ctranslate2",
            "library", "dll", "no such cu",
        )
    )


def _build_model(size: str, device: str):
    """Build a WhisperModel for the given device. Returns the model."""
    from faster_whisper import WhisperModel
    if device == "cuda":
        return WhisperModel(size, device="cuda", compute_type="float16")
    return WhisperModel(size, device="cpu", compute_type="int8")


def _get_model(size: Optional[str] = None, force_cpu: bool = False):
    """Return a cached WhisperModel, building it on first use.

    If force_cpu is True, skips CUDA entirely (used as fallback after a
    CUDA-runtime failure during inference)."""
    global _model, _model_device
    if _model is None:
        try:
            from ..core.config import settings
            size = size or settings.voice.stt_model
        except Exception:
            size = size or "base.en"

        # Try CUDA first unless explicitly forced to CPU.
        if not force_cpu:
            try:
                _model = _build_model(size, "cuda")
                _model_device = "cuda"
                log.info("faster-whisper '%s' on CUDA (vad=%s)", size, _VAD_OK)
                return _model
            except Exception as e:
                log.warning("CUDA whisper model construct failed (%s); using CPU", e)

        _model = _build_model(size, "cpu")
        _model_device = "cpu"
        log.info("faster-whisper '%s' on CPU int8 (vad=%s)", size, _VAD_OK)
    return _model


def _evict_model() -> None:
    """Drop the cached model so the next call rebuilds it."""
    global _model, _model_device
    _model = None
    _model_device = None


def record(seconds: float = 5.0, sr: int = 16000):
    import numpy as np
    import sounddevice as sd
    log.info("recording %.1fs", seconds)
    audio = sd.rec(int(seconds * sr), samplerate=sr, channels=1, dtype="float32")
    sd.wait()
    return np.asarray(audio).squeeze()


def _run_transcribe(model, audio, language: str, use_vad: bool) -> str:
    """Run a transcription and fully consume the segment generator.

    The generator does the actual GPU/CPU work *during iteration*, so we have
    to materialize it inside the try block — exceptions raised during encode
    happen here, not at the .transcribe() call site."""
    segments, _ = model.transcribe(audio, language=language, vad_filter=use_vad)
    out = []
    for s in segments:  # iterate to trigger inference; errors raise here
        if s.text:
            out.append(s.text.strip())
    return " ".join(out).strip()


def transcribe(audio, sr: int = 16000, language: Optional[str] = None) -> str:
    if language is None:
        try:
            from ..core.config import settings
            language = settings.voice.language
        except Exception:
            language = "en"

    m = _get_model()

    # First attempt
    try:
        return _run_transcribe(m, audio, language, use_vad=_VAD_OK)
    except Exception as e:
        cuda_problem = _is_cuda_runtime_error(e) and _model_device == "cuda"
        log.warning(
            "transcribe failed (vad=%s, device=%s): %s%s",
            _VAD_OK, _model_device, e,
            " — falling back to CPU" if cuda_problem else " — retrying without VAD",
        )

        if cuda_problem:
            # CUDA libraries aren't usable on this machine. Evict and rebuild on CPU
            # for this call AND all subsequent calls during the process lifetime.
            _evict_model()
            m = _get_model(force_cpu=True)
            try:
                return _run_transcribe(m, audio, language, use_vad=_VAD_OK)
            except Exception as e2:
                log.warning("CPU retry failed (%s); retrying without VAD", e2)
                return _run_transcribe(m, audio, language, use_vad=False)

        # Non-CUDA error: usually VAD-related. Retry once without VAD.
        return _run_transcribe(m, audio, language, use_vad=False)


def transcribe_bytes(wav_bytes: bytes) -> str:
    """Accepts WAV bytes; tolerates 16-bit PCM mono/stereo at any sample rate.

    Browsers usually record WebM/Opus rather than WAV - the frontend converts
    to 16-bit PCM mono WAV via OfflineAudioContext before uploading.
    """
    import numpy as np
    with wave.open(io.BytesIO(wav_bytes), "rb") as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        n = w.getnframes()
        raw = w.readframes(n)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        audio = audio.reshape(-1, ch).mean(axis=1)
    return transcribe(audio, sr=sr)
