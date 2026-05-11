# OMNI backend

The Python brain. A FastAPI sidecar that exposes HTTP + WebSocket on
`127.0.0.1:8765` and is consumed by the Tauri/React shell over loopback.

## Run

```powershell
..\.venv\Scripts\python.exe -m backend.main
```

Or just use `..\run-backend.ps1` from the project root.

## Layout

```
backend/
├── main.py                 FastAPI app + lifespan + WebSocket
├── core/                   Config, LLM, safety gate, orchestrator, events, hardware, logging
├── memory/                 SQLite + FTS5 + LanceDB + Fernet-encrypted answers
├── perception/             Screen capture + Qwen2.5-VL + active-window + OCR fallback
├── action/                 Mouse / keyboard / Playwright Chrome / safe file edits
├── workflow/               State machine + job_search adapters + chatgpt_tabs + apply + resume
├── voice/                  faster-whisper STT + Piper TTS (lazy-imported)
├── tools/                  Build helpers (icon generator)
├── tests/                  Smoke tests
├── requirements.txt        Core deps
└── requirements-voice.txt  Voice deps (optional)
```

Each folder has its own `README.md` — open them for the details.

## HTTP / WebSocket surface

| Endpoint | Purpose |
| --- | --- |
| `GET  /health` | Liveness + Ollama + browser_mode |
| `GET  /status` | Full settings snapshot (paths, perms, prefs, browser, personality, voice) |
| `GET  /models` | Installed Ollama models + active profile |
| `PATCH /config` | Patch any nested settings group: `paths`, `perms`, `prefs`, `browser`, **`personality`**, **`voice`** |
| `POST /session/start` | Begin one job-search session |
| `POST /session/stop` | Emergency stop |
| `POST /session/pause` | Pause at next safe checkpoint |
| `POST /session/resume` | Resume a paused session |
| `POST /browser/attach` | Idempotent attach-or-launch Chrome |
| `POST /browser/close` | Detach |
| `GET  /browser/tabs` | Tab list |
| `POST /perm/respond` | Approve / deny a tier-2/3 prompt |
| `POST /chat` | Chat with OMNI (uses `personality.system_prompt()`) |
| `GET  /memory/jobs?q=` | FTS search over jobs |
| `GET  /memory/audit?limit=` | Audit log |
| `GET  /voice/voices` | List Piper voices in `data/voices/` |
| `POST /voice/transcribe` | Multipart WAV → text (faster-whisper) |
| `POST /voice/speak` | JSON `{text, voice_id?}` → WAV (Piper) |
| `WS /ws` | Live event stream (state, audit, leads, permission_request, info, warning, error) |

## Key invariants

- No paid LLM API. All inference goes through `core.llm.Ollama`.
- Every Tier-2/3 action passes through `core.safety.gate.gate(Action(...))`.
- Tier-3 (HARD) always asks the user — final submit, unknown sensitive answer,
  internet on a new domain, indexing a new folder.
- Resume / tracker edits make a backup first via `action.files.backup`.
- Screenshots are deleted after VLM consumption.
- The agent never bypasses CAPTCHA, paywalls, or anti-bot systems.

## Environment

```
OMNI_HOST=127.0.0.1
OMNI_PORT=8765
OMNI_LOG_LEVEL=INFO
OMNI_OLLAMA_HOST=http://127.0.0.1:11434
```
