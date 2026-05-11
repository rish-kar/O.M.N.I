# `docs/` — design notes

Architecture-level reading. Not user-facing — the user-facing intro is in the
project-root `README.md`.

## Files

| File | What's in it |
| --- | --- |
| `ARCHITECTURE.md` | The component diagram, the state machine, data flow from screen → VLM → action. The mental model for OMNI. |
| `DECISIONS.md` | Why this stack: Ollama over OpenAI API, Tauri over Electron, SQLite over Postgres, faster-whisper over OpenAI Whisper, Piper over Coqui. Pros / cons / what changes if a constraint shifts. |
| `PERMISSIONS.md` | The three-tier safety model (READ / ACT / HARD), what each tier covers, how the toasts and the gate interact. |
| `MODELS.md` | VRAM thresholds and the auto-picked model profiles for 6 / 12 / 16 / 24 GB cards. |

## Where to start

If you want to *modify* OMNI, read `ARCHITECTURE.md` then `PERMISSIONS.md`.
If you want to *understand* a choice, `DECISIONS.md`.
If you want to know which model OMNI will pick on your machine, `MODELS.md`.
