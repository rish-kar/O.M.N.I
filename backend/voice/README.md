# `backend/voice/` — speak & listen, fully offline

OMNI talks. STT via faster-whisper, TTS via Piper. No cloud calls.

## Files

| File | Responsibility |
| --- | --- |
| `stt.py` | `faster-whisper` wrapper. Picks CUDA float16 if available, falls back to CPU int8. Exposes `record(seconds, sr)`, `transcribe(audio)`, and `transcribe_bytes(wav_bytes)` (used by the `/voice/transcribe` endpoint). Model size + language come from `settings.voice`. |
| `tts.py` | Piper wrapper. Caches loaded `.onnx` voices keyed by id. Exposes `synthesize_voice(text, voice_id) -> wav_bytes` and `speak(text)` (local playback via `sounddevice`). The `/voice/speak` endpoint uses `synthesize_voice`. |

## Endpoints

The frontend talks to:

- `GET  /voice/voices`     — list `.onnx` files in `data/voices/` plus the active id.
- `POST /voice/transcribe` — multipart upload of a 16-bit PCM WAV; returns `{text}`.
- `POST /voice/speak`      — JSON `{text, voice_id?}`; returns a WAV.

The browser records WebM/Opus and converts to mono 16 kHz PCM WAV in the
frontend before uploading (see `ChatPanel.tsx`).

## Voices

Drop any Piper voice into `data/voices/`:

```
en_US-lessac-medium.onnx
en_US-lessac-medium.onnx.json
```

`/voice/voices` lists them automatically. Settings → Voice picks the active one.
Browse the catalog at https://github.com/rhasspy/piper/blob/master/VOICES.md.

## Why lazy imports?

`faster-whisper` and `piper-tts` lag the latest Python release. The rest of
OMNI keeps starting cleanly even when these aren't installed — voice endpoints
return HTTP 503 with an explanatory message instead.

## Models

The default STT model is `base.en` (good speed/accuracy on a modern GPU). On
the laptop target (RTX 4090) you can crank up to `medium.en` from
**Settings → Voice → STT model size** without breaking a sweat.
