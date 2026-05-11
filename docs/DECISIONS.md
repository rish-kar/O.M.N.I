# OMNI design decisions

## Stack: Option 1 (Python + Tauri + Ollama)

Chosen for fastest path to working agent on Windows. Python ecosystem covers
DOCX/XLSX edits, Playwright, pyautogui, faster-whisper, Piper. Tauri gives a
native shell with tray + notifications and an installable MSI/NSIS bundle.
The C# native option (Stack 3) is the migration target after MVP-9.

## Single-process backend

One FastAPI process owns: LLM client, vector index, SQLite, screen capture,
input controller, browser. Reasons: shared state (LanceDB connection, browser
context), and shared safety gate. Sub-processes only for heavy isolated jobs
(none yet).

## Ollama over llama.cpp direct

Ollama gives uniform `tags`/`pull`/`embed`/`generate`/`chat` endpoints, manages
model files in one place, and works with vision models. We can swap to
llama.cpp server later without changing call sites — `core.llm.Ollama` is the
seam.

## SQLite + LanceDB (not Chroma)

SQLite for relational + audit + FTS5. LanceDB for vectors because the storage
format is a single columnar dir on disk, no server needed, fast for the small
scale we expect (≤ 1M vectors).

## ChatGPT web UI (not OpenAI API)

Hard requirement from the user. The agent never imports `openai`. It opens
the user's already-logged-in tabs in a Playwright-attached Chrome and types
into the composer. Eight tabs are processed in parallel via
`asyncio.Semaphore`.

## Three-tier safety gate

`READ` — ambient, auto-allowed (audit only).
`ACT`  — auto-allowed if folder/site is on allowlist; otherwise UI prompt.
`HARD` — always UI prompt (final submit, sensitive answer, internet on a new
domain). Implementation: `core.safety.SafetyGate.gate(action)`.

## Screenshots are ephemeral

`perception.screen.save_temp` writes to `data/snapshots/` only when needed for
disk-roundtrip; `cleanup` removes them. VLM calls pass `PIL.Image` objects
directly so most flows never touch disk.

## Resume edits never overwrite the master

`workflow.resume.tailor` always copies the master to a job-specific path under
`data/downloads/resumes/{Company_Role}/` and edits the copy. The master is
backed up on every run via `action.files.backup`.

## Single tracker model

The tracker XLSX has the headers in `action.files.TRACKER_HEADERS`. Adding a
column means updating that constant and the row dict in
`orchestrator._handle_result`. Existing trackers are auto-extended on append
when needed (`tracker_append` reads and writes idempotently).
