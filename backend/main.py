"""OMNI backend HTTP/WS API on 127.0.0.1:8765."""
from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from .action.browser import chrome
from .core.config import settings
from .core.events import bus
from .core.hardware import detect_vram_gb, choose_profile
from .core.llm import llm
from .core.logging import get, setup as log_setup
from .core.orchestrator import orchestrator, SessionParams
from .core.safety import gate
from .memory import store as mem
from .memory.store import init_db

log = get("omni.api")


async def _warm_voice() -> None:
    """Preload Piper voice and Whisper model in the background so the first
    /voice/* request doesn't pay the cold-start cost (multi-second on CPU)."""
    if not settings.voice.enabled:
        return
    try:
        from .voice import tts, stt  # type: ignore
    except Exception as e:
        log.info("voice deps unavailable, skipping warm-up: %s", e)
        return

    def _warm():
        try:
            tts._load(settings.voice.voice_id)
            log.info("piper voice warmed")
        except Exception as e:
            log.info("piper warm-up skipped: %s", e)
        try:
            stt._get_model()
            log.info("whisper model warmed")
        except Exception as e:
            log.info("whisper warm-up skipped: %s", e)

    asyncio.create_task(asyncio.to_thread(_warm))


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_setup()
    init_db()
    if settings.auto_vram_profile:
        vram = detect_vram_gb()
        if vram > 0:
            picked = choose_profile(vram)
            for k, v in picked.items():
                setattr(settings.profile, k, v)
            settings.save()
            log.info("VRAM=%.1fGB profile=%s", vram, picked)
    await _warm_voice()
    log.info("OMNI backend ready on %s:%d", settings.host, settings.port)
    yield
    log.info("shutting down")
    try:
        await chrome.close()
    except Exception:
        pass


app = FastAPI(title="OMNI", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "https://tauri.localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# request models
class StartReq(BaseModel):
    query: str
    location: str
    sources: list[str] = ["linkedin", "glassdoor"]
    batch_size: int = 8
    avoid_easy_apply: bool = True


class ChatReq(BaseModel):
    message: str
    session_id: Optional[int] = None
    fast: bool = False  # voice mode sets this so we pick the smaller/faster model


class SessionCreateReq(BaseModel):
    title: Optional[str] = None


class SessionPatchReq(BaseModel):
    title: str


class PermResp(BaseModel):
    id: str
    approved: bool
    value: Optional[dict] = None
    reason: str = ""


class ConfigPatch(BaseModel):
    paths: Optional[dict] = None
    perms: Optional[dict] = None
    prefs: Optional[dict] = None
    browser: Optional[dict] = None
    personality: Optional[dict] = None
    voice: Optional[dict] = None


class SpeakReq(BaseModel):
    text: str
    voice_id: Optional[str] = None


# system
@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "ollama": await llm.health(),
        "state": orchestrator.state.value,
        "stopped": gate.stopped,
        "browser_mode": chrome.mode,
    }


@app.get("/status")
async def status() -> dict:
    return {
        "state": orchestrator.state.value,
        "models": settings.profile.model_dump(),
        "permissions": settings.perms.model_dump(),
        "paths": settings.paths.model_dump(),
        "prefs": settings.prefs.model_dump(),
        "browser": settings.browser.model_dump(),
        "browser_mode": chrome.mode,
        "personality": settings.personality.model_dump(),
        "voice": settings.voice.model_dump(),
    }


@app.get("/models")
async def models() -> dict:
    try:
        installed = await llm.list_models()
    except Exception:
        installed = []
    return {"installed": installed, "profile": settings.profile.model_dump()}


@app.patch("/config")
async def patch_config(p: ConfigPatch) -> dict:
    if p.paths:
        settings.paths = settings.paths.model_copy(update=p.paths)
    if p.perms:
        settings.perms = settings.perms.model_copy(update=p.perms)
    if p.prefs:
        settings.prefs = settings.prefs.model_copy(update=p.prefs)
    if p.browser:
        settings.browser = settings.browser.model_copy(update=p.browser)
    if p.personality:
        settings.personality = settings.personality.model_copy(update=p.personality)
    if p.voice:
        settings.voice = settings.voice.model_copy(update=p.voice)
    settings.save()
    return {"ok": True}


# orchestrator control
@app.post("/session/start")
async def session_start(req: StartReq) -> dict:
    try:
        await orchestrator.start(SessionParams(**req.model_dump()))
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


@app.post("/session/stop")
async def session_stop() -> dict:
    orchestrator.stop()
    return {"ok": True}


@app.post("/session/pause")
async def session_pause() -> dict:
    orchestrator.pause()
    return {"ok": True}


@app.post("/session/resume")
async def session_resume() -> dict:
    orchestrator.resume()
    return {"ok": True}


# browser control
@app.post("/browser/attach")
async def browser_attach() -> dict:
    try:
        mode = await chrome.attach_or_launch()
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"ok": True, "mode": mode}


@app.post("/browser/close")
async def browser_close() -> dict:
    await chrome.close()
    return {"ok": True}


@app.get("/browser/tabs")
async def browser_tabs() -> dict:
    return {"tabs": await chrome.list_tabs(), "mode": chrome.mode}


# permissions
@app.post("/perm/respond")
async def perm_respond(r: PermResp) -> dict:
    ok = gate.respond(r.id, r.approved, r.value, r.reason)
    if not ok:
        raise HTTPException(404, "no pending permission with that id")
    return {"ok": True}


# chat
def _make_session_title(msg: str, limit: int = 50) -> str:
    one_line = " ".join(msg.split())
    return one_line[: limit - 1] + "…" if len(one_line) > limit else one_line or "New Chat"


@app.post("/chat")
async def chat(req: ChatReq) -> dict:
    # Resolve or create session
    session_id = req.session_id
    is_new_session = False
    if session_id is None or not mem.session_exists(session_id):
        session_id = mem.create_session(_make_session_title(req.message))
        is_new_session = True

    try:
        mem.save_message("user", req.message, session_id=session_id)
    except Exception as e:
        log.exception("save user message failed")
        raise HTTPException(500, f"Couldn't save your message: {e}")

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in mem.recent_messages(20, session_id=session_id)
    ]
    history.insert(0, {
        "role": "system",
        "content": settings.personality.system_prompt(),
    })

    # Pick the model. Voice mode asks for "fast"; if the configured fast model
    # isn't installed in Ollama, transparently fall back to text_reason.
    chat_model: Optional[str] = None
    if req.fast:
        try:
            installed = set(await llm.list_models())
        except Exception:
            installed = set()
        wanted = settings.profile.text_fast
        if wanted in installed:
            chat_model = wanted
        else:
            log.info("fast model %s not installed; falling back to text_reason", wanted)

    try:
        reply = await llm.chat(history, model=chat_model)
    except Exception as e:
        log.exception("LLM chat failed")
        msg = str(e) or e.__class__.__name__
        low = msg.lower()
        if "connect" in low or "refused" in low or "timeout" in low or "name or service" in low:
            raise HTTPException(503, "OMNI's local model (Ollama) isn't reachable. Start Ollama and try again.")
        if "not found" in low or "404" in low or "no such model" in low:
            raise HTTPException(503, "The selected model isn't installed in Ollama. Pull it via 'ollama pull <model>'.")
        raise HTTPException(500, f"Local model error: {msg[:200]}")

    if not reply:
        raise HTTPException(500, "The model returned an empty reply. Try a smaller prompt or different model.")

    try:
        mem.save_message("assistant", reply, session_id=session_id)
    except Exception:
        log.exception("save assistant message failed")

    return {"reply": reply, "session_id": session_id, "new_session": is_new_session}


@app.get("/chat/history")
async def chat_history(session_id: Optional[int] = None, limit: int = 200) -> dict:
    """Messages for a session (or all latest messages if no session_id)."""
    if session_id is not None:
        rows = mem.messages_for_session(session_id, limit)
    else:
        rows = mem.recent_messages(limit)
    messages = [
        {"role": m["role"], "content": m["content"], "ts": m["ts"]}
        for m in rows
        if m["role"] in ("user", "assistant")
    ]
    return {"messages": messages, "session_id": session_id}


# chat sessions
@app.get("/chat/sessions")
async def chat_sessions() -> dict:
    return {"sessions": mem.list_sessions()}


@app.post("/chat/sessions")
async def chat_session_new(req: SessionCreateReq) -> dict:
    sid = mem.create_session(req.title or "New Chat")
    return {"id": sid, "title": req.title or "New Chat"}


@app.patch("/chat/sessions/{sid}")
async def chat_session_rename(sid: int, req: SessionPatchReq) -> dict:
    if not mem.session_exists(sid):
        raise HTTPException(404, "session not found")
    mem.update_session_title(sid, req.title)
    return {"ok": True}


@app.delete("/chat/sessions/{sid}")
async def chat_session_delete(sid: int) -> dict:
    if not mem.session_exists(sid):
        raise HTTPException(404, "session not found")
    mem.delete_session(sid)
    return {"ok": True}


# voice
@app.get("/voice/voices")
async def voice_voices() -> dict:
    """List Piper voice files present in data/voices."""
    from .core.config import DATA
    voices_dir = DATA / "voices"
    voices = []
    if voices_dir.exists():
        for p in voices_dir.glob("*.onnx"):
            json_path = p.with_suffix(p.suffix + ".json")
            voices.append({
                "id": p.stem,
                "file": str(p),
                "ready": json_path.exists(),
            })
    return {
        "voices": voices,
        "current": settings.voice.voice_id,
        "voices_dir": str(voices_dir),
    }


@app.post("/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...)) -> dict:
    """Transcribe a WAV file (16-bit mono recommended) to text."""
    try:
        from .voice import stt
    except ImportError as e:
        log.error("voice deps unavailable: %s", e)
        raise HTTPException(503, "Voice features need extra Python packages. Run install.ps1 to add them.")
    data = await audio.read()
    try:
        text = await asyncio.to_thread(stt.transcribe_bytes, data)
    except (ImportError, OSError) as e:
        # DLL load failures (e.g. missing VC++ runtime, broken onnxruntime install)
        log.exception("STT DLL load failed")
        raise HTTPException(
            503,
            "Speech recognition can't load its native libraries. "
            f"Reinstall voice deps (pip install --force-reinstall -r backend/requirements-voice.txt). Detail: {str(e)[:120]}",
        )
    except Exception as e:
        log.exception("STT failed")
        msg = str(e).lower()
        if "cublas" in msg or "cudnn" in msg or "cudart" in msg:
            raise HTTPException(
                503,
                "CUDA libraries (cuBLAS/cuDNN) aren't available. Install the CUDA 12 runtime, "
                "or set STT model to CPU mode — reinstall voice deps to force CPU.",
            )
        if "onnxruntime" in msg:
            raise HTTPException(503, "Speech recognition needs the onnxruntime package. Run: pip install onnxruntime")
        if "out of memory" in msg or "cuda" in msg:
            raise HTTPException(503, "GPU out of memory while transcribing. Try a smaller STT model in Settings.")
        raise HTTPException(500, f"Couldn't transcribe that clip: {str(e)[:160]}")
    return {"text": text}


@app.post("/voice/speak")
async def voice_speak(req: SpeakReq) -> Response:
    """Synthesize the text to a WAV the frontend can play."""
    if not req.text.strip():
        raise HTTPException(400, "empty text")
    try:
        from .voice import tts
    except ImportError as e:
        log.error("voice deps unavailable: %s", e)
        raise HTTPException(503, "Voice features need extra Python packages. Run install.ps1 to add them.")
    voice_id = req.voice_id or settings.voice.voice_id
    try:
        wav = await asyncio.to_thread(tts.synthesize_voice, req.text, voice_id)
    except FileNotFoundError as e:
        log.warning("voice file missing: %s", e)
        raise HTTPException(404, "Voice file not found. Open Settings -> Voice to download or pick another voice.")
    except (ImportError, OSError) as e:
        # onnxruntime / piper native DLL load failure
        log.exception("TTS DLL load failed")
        raise HTTPException(
            503,
            "Text-to-speech can't load its native libraries (onnxruntime). "
            f"Reinstall voice deps. Detail: {str(e)[:120]}",
        )
    except Exception as e:
        log.exception("TTS failed")
        msg = str(e).lower()
        if "onnxruntime" in msg or "dll load failed" in msg:
            raise HTTPException(503, "Text-to-speech needs onnxruntime. Reinstall voice deps.")
        raise HTTPException(500, f"Couldn't synthesize speech: {str(e)[:160]}")
    return Response(content=wav, media_type="audio/wav")


# memory views
@app.get("/memory/jobs")
async def memory_jobs(q: str = "") -> dict:
    return {"jobs": mem.search_jobs(q) if q else []}


@app.get("/memory/audit")
async def memory_audit(limit: int = 100) -> dict:
    with mem.conn() as c:
        rows = c.execute(
            "SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return {"audit": [dict(r) for r in rows]}


# WebSocket events
@app.websocket("/ws")
async def ws(ws: WebSocket) -> None:
    await ws.accept()
    q = bus.subscribe("*")
    try:
        await ws.send_json({"kind": "hello", "data": {"version": "0.1.0"}})
        while True:
            msg = await q.get()
            await ws.send_json(msg)
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe("*", q)


def main() -> None:
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=settings.host, port=settings.port,
        reload=False, log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
