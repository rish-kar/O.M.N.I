# O.M.N.I — Offline Machine Navigation Intelligence

> A privacy-first, **fully local** Windows desktop AI agent that helps you
> apply for jobs, tailor resumes, fill applications, and chat back — all
> without sending a single byte to a cloud LLM API.

OMNI runs on your machine. Inference, vision, voice — everything. There is no
OpenAI key. No telemetry. No "for your safety we're sending your data to
Anthropic." If your network cable is unplugged, OMNI still works for the parts
that don't need the actual internet (chat, voice, file edits, tracker, resume
tailoring); the moment you plug it back in, it can also drive your Chrome.

This README is long on purpose. It is the manual, the technical reference, and
the guided tour. The table of contents is your friend.

---

## Table of Contents

1. [What is OMNI?](#what-is-omni)
2. [Why does it exist?](#why-does-it-exist)
3. [Feature highlights](#feature-highlights)
4. [Hardware target](#hardware-target)
5. [The stack at a glance](#the-stack-at-a-glance)
6. [Repository layout](#repository-layout)
7. [Quick start](#quick-start-windows-powershell)
8. [Navigation guide — your first 10 minutes](#navigation-guide--your-first-10-minutes)
9. [The user interface in detail](#the-user-interface-in-detail)
10. [Connecting Chrome — the right way](#connecting-chrome--the-right-way)
11. [Voice mode](#voice-mode)
12. [Personality & tone](#personality--tone)
13. [The safety gate (3 tiers)](#the-safety-gate-3-tiers)
14. [The job-search workflow](#the-job-search-workflow)
15. [Memory model](#memory-model)
16. [Local model selection](#local-model-selection)
17. [API reference (HTTP + WebSocket)](#api-reference-http--websocket)
18. [Configuration reference](#configuration-reference)
19. [Privacy & security model](#privacy--security-model)
20. [Performance tuning](#performance-tuning)
21. [Troubleshooting](#troubleshooting)
22. [Contributing & extending](#contributing--extending)
23. [Roadmap & status](#roadmap--status)
24. [Documentation index](#documentation-index)

---

## What is OMNI?

OMNI is a desktop application — a Tauri-wrapped React UI talking to a Python
FastAPI sidecar over loopback (`127.0.0.1:8765`). It is, at heart, a **local
AI agent**:

- It *sees*: it can take screenshots and feed them to a local vision-language
  model (Qwen2.5-VL) when needed.
- It *acts*: it controls your real Chrome via the Chrome DevTools Protocol —
  navigates, fills forms, clicks — and it can also poke a keyboard / mouse
  via `pyautogui` for things outside the browser.
- It *thinks*: every reasoning step goes through Ollama running locally.
  No API keys, no rate limits, no your-data-leaves-the-box.
- It *remembers*: a single SQLite file holds your jobs, applications, audit
  log, and conversations. A LanceDB table holds the embeddings.
- It *talks*: faster-whisper transcribes you offline; Piper synthesises
  speech offline. Voice in, voice out, fully on-device.

The original use case is **job applications** — searching LinkedIn / Glassdoor
/ Workday, scoring listings against your resume, generating tailored cover
letters, writing rows into your tracker, handling Easy-Apply-style forms.
The scope expanded to "anything you'd want a tireless, privacy-respecting
assistant for on Windows" but jobs is the headline workflow.

## Why does it exist?

Most AI assistants either (a) only do chat, or (b) demand a paid API key and
ship every keystroke up to a third-party. OMNI is built around three
constraints that I refused to compromise on:

1. **No paid LLM API.** Inference runs entirely through Ollama on the local
   machine. Period. There is exactly one HTTP client to a remote LLM in the
   whole codebase, and it talks to `http://127.0.0.1:11434`.
2. **Confirm before doing anything irreversible.** Final form submit, sending
   files anywhere, indexing a brand-new folder — these are all
   `Tier.HARD` actions that **always** prompt the user. There is no
   "auto-accept-everything" mode.
3. **No magic.** Every Tier-2/3 action is logged in `data/omni.sqlite::audit`
   with the exact arguments and the user's decision. You can reconstruct
   *everything* OMNI did, in order, forever.

These constraints shape every design choice you'll see below.

## Feature highlights

- **Real Chrome, real logins.** OMNI attaches to your actual Chrome via CDP
  (after `launch-chrome.ps1`) or launches Chrome with a persistent OMNI
  profile. Your bookmarks, passwords, and cookies are reused. New navigations
  open as **new tabs in the existing window** — never a fresh window — so
  you don't lose context.
- **8-tab ChatGPT orchestrator.** Pre-open ~8 ChatGPT tabs (signed in, each
  on a Project containing your master prompt) and OMNI distributes JDs across
  them in parallel. No OpenAI API ever sees your data.
- **Resume tailoring without overwriting.** OMNI works on a per-job copy of
  your master `.docx`. The master is read-only from OMNI's perspective.
- **Tracker append with auto-backup.** Every Excel write makes a timestamped
  `.bak` first. You can roll back any edit.
- **Encrypted answers.** Sensitive form answers (visa status, salary
  expectations) are stored Fernet-encrypted using a key kept locally at
  `data/.key`.
- **Voice in / voice out.** Click the mic in the chat panel — faster-whisper
  transcribes locally, OMNI replies, and Piper speaks the reply back. Voice
  + tone are configurable.
- **Configurable personality.** OMNI knows it's OMNI. You set its tone
  (friendly / playful / formal / concise / mentor), humor level, verbosity,
  whether to address you by name, and any custom instructions. The system
  prompt is rebuilt on every chat call.
- **Permission toasts.** Every Tier-2/3 action pops a small bottom-right card
  with the action, the target, and Approve / Skip. Esc cancels.
- **Tray + sidecar.** Closing the window keeps OMNI alive in the system tray;
  reopen, pause, resume, or emergency-stop from the tray menu.
- **Onboarding tour + tooltips everywhere.** First launch walks you through a
  5-step tour. Every label has an info-icon tooltip explaining what it does
  and what changes if you toggle it.

## Hardware target

OMNI is developed on an **Alienware m18 R2 with an RTX 4090 laptop GPU
(16 GB VRAM)** running Windows 11. The model profiles are auto-picked based
on detected VRAM, so 12 GB and 24 GB cards work too — see
[`docs/MODELS.md`](docs/MODELS.md). Below 8 GB you'll be on CPU-fallback for
the heavy reasoning model (slow, but it works).

CPU-only runs are technically supported. Expect chat latency in the seconds
to tens-of-seconds, and don't run vision steps if you can avoid them.

## The stack at a glance

| Layer | Choice |
| --- | --- |
| **LLM runtime** | [Ollama](https://ollama.com/) (text + vision + embeddings) |
| **Chat models** | Qwen2.5 7B / 14B / 32B Instruct (q4_K_M), auto-selected by VRAM |
| **Vision** | Qwen2.5-VL (7B) |
| **Embeddings** | nomic-embed-text |
| **STT** | faster-whisper (CTranslate2) |
| **TTS** | [Piper](https://github.com/rhasspy/piper) |
| **Browser automation** | Playwright (Chromium / Chrome over CDP) |
| **OS automation** | pyautogui + pywinauto + pygetwindow |
| **Backend** | Python 3.11+, FastAPI, uvicorn |
| **Memory** | SQLite (FTS5 for keyword search) + LanceDB (vectors) + Fernet (encryption) |
| **Frontend** | Tauri 2 + React 18 + TypeScript + Tailwind 3 + Zustand + Framer Motion |
| **Bundling** | Vite for React, Cargo for Tauri/Rust, sidecar for Python |

For the rationale behind each choice, see [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Repository layout

```
omni/
├── backend/                   Python AI engine (FastAPI on 127.0.0.1:8765)
│   ├── main.py                FastAPI app + lifespan + WebSocket
│   ├── core/                  Config, LLM, safety gate, orchestrator, events, hardware, logging
│   ├── memory/                SQLite + FTS5 + LanceDB + Fernet
│   ├── perception/            Screen capture + VLM + active-window + OCR
│   ├── action/                Mouse / keyboard / Playwright Chrome / safe file edits
│   ├── workflow/              State machine + adapters + chatgpt_tabs + apply + resume
│   ├── voice/                 faster-whisper STT + Piper TTS (lazy)
│   ├── tools/                 Build helpers
│   ├── tests/                 Smoke tests
│   ├── requirements.txt
│   └── requirements-voice.txt
├── frontend/                  Tauri shell + React UI
│   ├── index.html
│   ├── public/icon.svg        Source SVG for the OMNI logo
│   ├── src/                   App, store, api, components/, styles, theme
│   ├── src-tauri/             Rust shell, tray, sidecar, generated icons, capabilities
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.ts
│   ├── tsconfig*.json
│   └── package.json
├── docs/                      ARCHITECTURE / DECISIONS / PERMISSIONS / MODELS
├── data/                      User data (gitignored): config, sqlite, lancedb, voices, etc.
├── logs/                      Audit + debug logs (gitignored)
├── install.ps1                Bootstrap: detects + installs prereqs, sets up project
├── launch-chrome.ps1          Open Chrome with CDP enabled (recommended)
├── run-dev.ps1                Dev launcher (backend + Tauri)
├── run-backend.ps1            Backend only
├── ROADMAP.md                 Milestones (MVP 0 → MVP 9)
├── OMNI_Agent_Build_Prompt.txt The prompt used to scaffold this project
└── README.md                  This document
```

Every folder above has its own `README.md` — those go deeper than this top
level and are the right place to start when you're working on a specific
subsystem.

## Quick start (Windows, PowerShell)

```powershell
# 1. Bootstrap. install.ps1 detects what's missing (Python, Node, Rust, Ollama)
#    and installs them via winget. Then it sets up the venv, npm, and pulls
#    the right Ollama models for your detected GPU.
.\install.ps1

# 2. (Recommended) Launch Chrome with CDP enabled, in a dedicated profile.
#    Sign in to LinkedIn / ChatGPT / Glassdoor in this Chrome once. Open ~8
#    ChatGPT tabs ready to receive prompts.
.\launch-chrome.ps1

# 3. Run OMNI (backend + UI). The "Connect Chrome" button in the sidebar
#    will attach to that CDP Chrome. If you skipped step 2, OMNI launches
#    Chrome itself with the OMNI profile (you'll need to log in once).
.\run-dev.ps1
```

The first run creates `data/config.json`. Configure resume / tracker paths via
the sidebar (click any path field). The `data/.key` file is your local Fernet
key for encrypted answer memory — back it up if you care about portability.

## Navigation guide — your first 10 minutes

This is the section to read if you've just installed OMNI and want to go from
zero to your first successful job-search session.

### Step 0 — The onboarding tour

On first launch, a 5-step tour appears automatically. It mirrors what's
written here. You can re-launch it any time from the **Help** button (top
right of the header, the ❓ icon).

### Step 1 — Connect Chrome

In the **left sidebar**, find the *Browser* section. Click **Connect Chrome**.
Three things can happen:

- If you ran `launch-chrome.ps1` first, OMNI attaches to that window over CDP
  on `127.0.0.1:9222`. The pill turns into `Chrome cdp` and your existing
  tabs are reused. **This is the recommended path** — your real logins,
  passwords, bookmarks, and extensions all come along.
- If no CDP endpoint is reachable but `browser.launch_managed` is true, OMNI
  finds your installed Chrome and launches it with `--remote-debugging-port=9222`
  pointing at a persistent profile in `%LOCALAPPDATA%\OMNI\chrome-profile`.
  You'll need to sign in once; the profile is kept between runs.
- As a last resort, an ephemeral Playwright-managed Chromium opens. Logins
  won't persist. Use this only if Chrome isn't installed.

### Step 2 — Set permissions

Below *Browser* is *Permissions*. Toggle:

- **Internet** — required for any web-driving step. Off by default.
- **Screen watch** — only needed when OMNI uses the vision model. You can
  leave this off until OMNI explicitly tells you it needs it.
- **Learning mode** — optional. When ON, OMNI saves successful procedures so
  it repeats them faster on similar sites later.

Hover any of the small (i) icons for a one-line explanation. Hover the toggle
itself for a longer one.

### Step 3 — Set paths

The *Paths* section maps OMNI to the files it'll work with:

- **Resume** — your master `.docx`. OMNI **never** edits this — it makes a
  per-job copy and edits that.
- **Tracker** — your applications spreadsheet (`.xlsx`). OMNI appends rows
  here. Backups go to `data/backups/` before each write.
- **Cover letters** — folder where OMNI writes generated cover letters.
- **Documents** — optional folder OMNI can index for context (read-only).

Click any row, paste an absolute Windows path, hit OK.

### Step 4 — Run a search

Centre of the screen, top panel is *Job search task*. Type:

- **Query** — the role. e.g. `Senior Java Backend Engineer`.
- **Location** — city / region / "Remote".

Hit **Run**. The state pill in the top-right switches from `IDLE` to
`PREPARE → SEARCH_JOBS → EXTRACT_JD → SEND_TO_CHATGPT_TAB → ...` as the
session progresses. The *Leads* panel fills with matches. The *Audit* feed
at the bottom shows every gated action.

### Step 5 — Approve and chat

Bottom-right of the screen, you'll see permission toasts whenever OMNI hits a
Tier-2/3 action — final form submit, sensitive answer, etc. Approve / Skip.

The *Conversation* panel on the right is for everything else: ask OMNI
questions, get help with a JD, debug a flaky tracker. Click the **mic** to
talk; OMNI transcribes locally and replies in voice if auto-speak is on.

### Step 6 — Customise OMNI

Click the **gear icon** (top right of the header). Two tabs:

- **Personality** — name, tone, humor, verbosity, how to address you, custom
  instructions. The system prompt is rebuilt on save; the next message picks
  up the new persona.
- **Voice** — pick a Piper voice (drop more `.onnx` + `.onnx.json` files into
  `data/voices/` to expand the list), enable / disable auto-speak, switch
  between push-to-talk and click-to-toggle, choose the faster-whisper model
  size.

That's the whole tour. Everything else is variations on these five panels.

## The user interface in detail

### Header

Left to right:

- **Logo** — the orbital ring + omega glyph. Click it to do nothing useful;
  it's there for vibes.
- **O.M.N.I wordmark** — gradient-painted in the brand blue→orange ramp.
- **Status pills** — Ollama health, Chrome mode, current orchestrator state,
  active reasoning model. Hover any pill for context.
- **Help button** — relaunches the onboarding tour.
- **Settings button** — opens the personality + voice modal.

### Sidebar (left, 256 px)

Glass panel sections, each with an info-tooltip on the title:

1. **Session** — Pause / Stop / (Resume).
2. **Browser** — Connect / Disconnect, current mode pill.
3. **Permissions** — Internet, Screen watch, Learning mode.
4. **Paths** — Resume, Tracker, Cover letters, Documents.

### Centre column (Dashboard)

- **Job search task** — query + location + Run button.
- **Leads** — one card per match. Click to open the listing in the connected
  Chrome (new tab in the existing window).
- **Audit** — live tail of every Tier-2/3 decision. Coloured green/red/yellow
  by approval state.

### Right column (Chat)

- **Heading row** — "Conversation" plus an Auto-speak toggle.
- **Messages** — user / assistant / system. Hover an assistant message to
  reveal a 🔊 button that re-speaks it.
- **Composer** — mic, text input, send. Enter to send, Shift+Enter for
  newline, Esc cancels a recording.

### Permission toasts (bottom-right, fixed)

Each toast shows tier + kind + a one-line summary (e.g. *"Submit application
to Acme?"*) and Approve / Skip buttons. Tier-3 toasts have a red border;
Tier-2 yellow; Tier-1 (rare) grey.

## Connecting Chrome — the right way

OMNI's Chrome strategy is unusual on purpose:

1. **You launch Chrome** with `launch-chrome.ps1`. This opens Chrome with a
   dedicated profile at `%LOCALAPPDATA%\OMNI\chrome-profile` and CDP on
   port 9222. Sign in to LinkedIn / Glassdoor / ChatGPT once; the profile
   persists, so the second run reuses every cookie.
2. **OMNI attaches** over CDP. New URLs open as **new tabs** in your existing
   Chrome window. Your bookmarks, password manager, extensions — all live.
3. **Optional: 8 ChatGPT tabs.** If you want OMNI to score JDs and write
   cover letters via the web ChatGPT (no API), open ~8 tabs on
   `chatgpt.com`, each on a Project that contains your master prompt. The
   `chatgpt_tabs.run_batch` orchestrator distributes JDs across them.

If `launch-chrome.ps1` is inconvenient and you only have a real Chrome
installed (no CDP), OMNI will detect that, find your `chrome.exe`, and
launch a new Chrome instance with the same persistent OMNI profile +
CDP enabled — you sign in once, and from then on it Just Works.

## Voice mode

The flow:

1. You click the mic. The browser opens `getUserMedia({ audio: true })` and
   starts a `MediaRecorder` (WebM/Opus by default — the best supported
   browser codec).
2. While recording, the audio goes into an `AnalyserNode` and the mic button
   pulses with the live audio level.
3. You click again (or Esc to cancel). The Blob is decoded with
   `OfflineAudioContext`, downmixed to mono, resampled to 16 kHz, and
   re-encoded as 16-bit PCM WAV in the browser. faster-whisper happily reads
   any sample rate, but 16k mono is its native target.
4. The WAV is POSTed to `/voice/transcribe` (multipart). The backend
   delegates to `voice/stt.py`, which lazy-loads faster-whisper, runs the
   transcription on CUDA float16 if available (CPU int8 fallback), and
   returns the text.
5. The text is sent to `/chat`. The chat endpoint rebuilds the system prompt
   from `personality.system_prompt()` and asks Ollama for a completion.
6. If **auto-speak** is on, the reply is sent to `/voice/speak`. The endpoint
   loads the active Piper voice (from `data/voices/<voice_id>.onnx`) and
   returns a WAV. The frontend plays it via `new Audio(blobUrl)`.

Voices are interchangeable. Drop a new `.onnx` + `.onnx.json` pair into
`data/voices/`, restart OMNI (or just hit Save in Settings), and it shows
up in the voice picker. Browse the catalog at
[rhasspy/piper VOICES.md](https://github.com/rhasspy/piper/blob/master/VOICES.md).

If the voice deps aren't installed (`faster-whisper` and `piper-tts` lag the
latest Python), the voice endpoints return HTTP 503 with an explanatory
message. The rest of OMNI keeps working.

## Personality & tone

OMNI knows it's OMNI. The chat system prompt is built per-call from
`Personality.system_prompt()`:

```text
You are OMNI, short for Offline Machine Navigation Intelligence. You are a
privacy-first local desktop AI agent running entirely on the user's Windows
machine — no cloud, no telemetry. Your job is to help the user search for
jobs, evaluate listings, tailor resumes and cover letters, fill applications,
and answer questions about anything they ask. You can see the screen, control
Chrome, type into forms, manage files, and speak/listen via offline STT
(faster-whisper) + TTS (Piper).
Personality: <tone>. <humor> <verbosity> <address>
When the user asks what you are, identify yourself as OMNI. Never claim to
be ChatGPT, Claude, or any other model. If you must perform a destructive
or sensitive action, mention that the safety gate will ask the user for
approval first.
```

Knobs (Settings → Personality):

- **Name** — keep `OMNI` unless you really want to rename.
- **Tone** — Friendly / Playful / Concise / Formal / Mentor.
- **Humor** — 0 (no jokes) → 10 (stand-up).
- **Verbosity** — 0 (one-line) → 10 (essays).
- **Address you as** — optional.
- **Custom instructions** — free-form, appended to the prompt.

Changes are picked up on the next chat call — no restart.

## The safety gate (3 tiers)

Three categories of action, three different rules:

- **Tier-1: READ.** Local file reads inside allowed folders, screenshots,
  process introspection. Never prompts. Always logged.
- **Tier-2: ACT.** Write files, click, type, navigate to a *known* domain,
  append to the tracker. Prompts unless an existing rule already approves.
  e.g. *"Internet → linkedin.com"* is auto-approved once enabled.
- **Tier-3: HARD.** Final form submit, sensitive answers, sending email /
  messages, indexing a brand-new folder, navigating to a brand-new domain.
  **Always prompts**, even if a similar action was approved before.

`gate.gate(Action(...))` is the single entry point. It awaits the user's
decision via the WebSocket, supports timeout, raises `Denied` on rejection,
audit-logs everything. There is no bypass.

See [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) for the full taxonomy.

## The job-search workflow

Drives by `core/orchestrator.py` running through `workflow/states.py`:

```
IDLE
  └─ session.start()
       └─ PREPARE                 (warn missing paths, attach Chrome)
            └─ SEARCH_JOBS        (job_search.search_all → leads)
                 └─ EXTRACT_JD    (page → JD text + metadata, store in jobs)
                      └─ SEND_TO_CHATGPT_TAB
                              (parallel across the 8 pre-opened tabs)
                           └─ UPDATE_TRACKER     (append row to xlsx, with backup)
                                └─ TAILOR_RESUME (DOCX copy per job)
                                     └─ APPLY_ON_SITE (form fill)
                                          └─ FINAL_REVIEW
                                               └─ SUBMIT_OR_SAVE   ← Tier-3 gate
                                                    └─ MEMORY_UPDATE
                                                         └─ DONE → IDLE
```

Pause from the sidebar holds at the next checkpoint. Stop is an emergency
stop — pending automation is cancelled. Both publish state events and the UI
updates instantly.

## Memory model

One SQLite file (`data/omni.sqlite`) with the following tables:

- `profile` — your user profile (preferences, single-row).
- `jobs` — every job listing OMNI has seen (URL-unique). Backed by an FTS5
  virtual table for keyword search.
- `applications` — one row per job-application attempt with score, verdict,
  cover-letter path, status, answers (encrypted JSON), timestamps.
- `answers` — Fernet-encrypted answers to form questions, indexed by
  question + site so OMNI can recall how you answered last time.
- `procedures` — saved per-site click-paths from learning-mode runs.
- `documents` — indexed local documents (path, sha, content). FTS5 over
  `path` + `content`.
- `audit` — every Tier-2/3 action with timestamp, actor, tier, detail JSON,
  decision.
- `conversations` — chat history (role, content, timestamp).
- `permissions` — durable rules (e.g. "linkedin.com is trusted").

LanceDB tables under `data/lance/` hold the embeddings: JD ↔ resume
similarity, document semantic search.

For why one SQLite file rather than three databases, see
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## Local model selection

`backend/core/hardware.py` detects VRAM (NVML / `nvidia-smi`) and picks the
right `ModelProfile`:

| VRAM | text_fast | text_reason | text_deep | vision |
| --- | --- | --- | --- | --- |
| ≥24 GB | qwen2.5:14b | qwen2.5:32b | qwen2.5:32b | qwen2.5vl:7b |
| 12-24 GB | qwen2.5:7b | qwen2.5:14b | qwen2.5:32b | qwen2.5vl:7b |
| 8-12 GB | qwen2.5:7b | qwen2.5:7b | qwen2.5:14b | qwen2.5vl:7b |
| <8 GB | qwen2.5:3b | qwen2.5:7b (slow) | — | — |

You can override the auto-pick — uncheck *Auto VRAM profile* in
`data/config.json` and set the model names manually. See
[`docs/MODELS.md`](docs/MODELS.md).

## API reference (HTTP + WebSocket)

The backend exposes an HTTP + WS API on `127.0.0.1:8765`. CORS is locked to
`localhost:1420` and `tauri://localhost`.

| Endpoint | Verb | Description |
| --- | --- | --- |
| `/health` | GET | Liveness, Ollama health, Chrome mode, gate state |
| `/status` | GET | Full settings snapshot (paths, perms, prefs, browser, **personality**, **voice**) |
| `/models` | GET | Installed Ollama models + active profile |
| `/config` | PATCH | Patch any nested settings group |
| `/session/start` | POST | Begin one job-search session |
| `/session/stop` | POST | Emergency stop |
| `/session/pause` | POST | Pause |
| `/session/resume` | POST | Resume |
| `/browser/attach` | POST | Idempotent attach-or-launch |
| `/browser/close` | POST | Detach |
| `/browser/tabs` | GET | Tab list |
| `/perm/respond` | POST | Approve/deny a pending permission |
| `/chat` | POST | Chat with OMNI |
| `/memory/jobs?q=` | GET | FTS over jobs |
| `/memory/audit?limit=` | GET | Audit log |
| `/voice/voices` | GET | List Piper voices in `data/voices/` |
| `/voice/transcribe` | POST | Multipart WAV → text |
| `/voice/speak` | POST | JSON `{text, voice_id?}` → WAV |
| `/ws` | WS | Live event stream |

WebSocket event kinds: `state`, `audit`, `leads`, `permission_request`,
`info`, `warning`, `error`, `application_evaluated`, `hello`.

## Configuration reference

`data/config.json` is auto-created on first launch. The shape mirrors the
Pydantic models in `backend/core/config.py`:

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "ollama_host": "http://127.0.0.1:11434",
  "auto_vram_profile": true,
  "profile": { "text_fast": "...", "text_reason": "...", "vision": "...", "embed": "..." },
  "paths": { "resume_master": "...", "tracker_xlsx": "...", "cover_letter_template": "...", "documents_root": "..." },
  "perms": { "internet": true, "screen_watch": false, "learning_mode": false, "allowed_folders": [], "denied_folders": [...], "trusted_sites": [...] },
  "prefs": { "target_titles": [], "target_locations": [], "avoid_easy_apply": true, "sponsorship_required": true, "salary_min": null, "salary_max": null },
  "browser": { "cdp_endpoint": null, "launch_managed": true, "reuse_existing_tab": true, "open_new_tab_on_attach": false },
  "personality": { "name": "OMNI", "tone": "friendly", "humor": 4, "verbosity": 4, "address_user_as": "", "custom_instructions": "" },
  "voice": { "enabled": true, "auto_speak_replies": true, "voice_id": "en_US-lessac-medium", "rate": 1.0, "stt_model": "base.en", "language": "en", "push_to_talk": false }
}
```

Env vars override the JSON, with the prefix `OMNI_`:

```
OMNI_HOST=127.0.0.1
OMNI_PORT=8765
OMNI_LOG_LEVEL=DEBUG
OMNI_OLLAMA_HOST=http://127.0.0.1:11434
```

## Privacy & security model

- **No paid LLM API.** Inference goes through Ollama on `127.0.0.1`. There
  is no fallback path to a cloud model.
- **CORS / network surface.** The backend binds `127.0.0.1` only. CORS
  allows only the local Tauri origins. Nothing on your LAN can talk to it.
- **Encrypted answers.** Sensitive form answers are Fernet-encrypted at
  rest. The key (`data/.key`) never leaves the machine.
- **Backups before writes.** Resume / tracker / cover-letter writes always
  copy the original to `data/backups/` first.
- **Screenshots are transient.** `data/snapshots/` is wiped after each VLM
  call. Pixels never go off-device.
- **Three-tier safety gate.** No bypass mode. No "yolo run" flag.
- **Audit log forever.** Every Tier-2/3 decision is in `audit` with the
  exact arguments and the user's decision.
- **Hosting profile.** OMNI never bypasses CAPTCHA, paywalls, or anti-bot
  systems. Form-fill respects rate limits.

## Performance tuning

A few knobs that meaningfully change OMNI's behaviour:

- **`auto_vram_profile`** — keep this on unless you really know your card.
- **`profile.text_reason`** — the model used for chat. Going from 14B to 7B
  doubles speed at a small accuracy cost.
- **`voice.stt_model`** — `base.en` is the sweet spot. `tiny.en` is twice as
  fast but noticeably less accurate; `medium.en` is the best you'll get on
  4090-class hardware in real time.
- **`browser.launch_managed`** — disable if you only ever want CDP attach
  (fail loudly when Chrome isn't ready).
- **Pause Ollama** — Ollama keeps models warm in VRAM. If you're done,
  `ollama stop <name>` frees the VRAM.

## Troubleshooting

- **`cargo metadata ... program not found`** → Rust isn't on PATH. Re-run
  `install.ps1`; if it still fails, install Rust manually from rustup.rs and
  reopen PowerShell.
- **`No ChatGPT tabs detected`** → Make sure you launched Chrome via
  `launch-chrome.ps1` and have ≥1 tab on `chatgpt.com`. Then click
  **Connect Chrome** in the sidebar.
- **`Ollama offline`** in the status bar → Open `ollama serve` in a
  terminal, or start the Ollama tray app.
- **Voice deps unavailable** → `faster-whisper` / `piper-tts` lag behind the
  latest Python release. Voice mode is optional; the rest of OMNI works
  without it. The voice endpoints return HTTP 503 until the deps install.
- **Mic doesn't record** → The Tauri webview honours OS-level mic
  permissions. Check Windows Settings → Privacy → Microphone → make sure
  desktop apps can access the mic.
- **Tauri icon errors** → Run
  `.\.venv\Scripts\python.exe -m backend.tools.make_icons --force` to
  regenerate from `frontend/public/icon.svg`.
- **Chrome attach fails with `Tab crashed`** → Some extensions
  (notably ad blockers) interfere with CDP. Try a clean profile via
  `launch-chrome.ps1`.
- **Tracker file is locked** → Close Excel before running a session. OMNI
  can't append to a file Excel has open in exclusive mode.

## Contributing & extending

OMNI is structured so adding a feature is mostly mechanical:

- **A new tier-2 action** → wrap it in `gate.gate(Action(...))`. The UI
  prompt comes for free.
- **A new job source** → write `async def search_<source>(query, location, opts) -> list[Lead]`
  in `backend/workflow/`, register it in `job_search.search_all`.
- **A new UI screen** → drop a component into `frontend/src/components/`,
  add any required state to `store.ts`, expose any required server data via
  `api.ts`.
- **A new model profile** → edit `backend/core/hardware.py`'s
  `choose_profile` to handle a new VRAM tier.

Style:

- Python: type hints, `from __future__ import annotations`, docstrings on
  public functions, `core.logging.get(...)` for everything.
- TypeScript: strict mode, named exports, Zustand for state, no class
  components.
- Commit messages: imperative mood, ≤72-char subject, body explains *why*.

## Roadmap & status

[`ROADMAP.md`](ROADMAP.md) tracks the MVP milestones. Current state:

- **MVP 0 complete.** All layers wired end-to-end. State machine, safety
  gate, memory, browser CDP attach, audit, voice mode, personality.
- **MVP 1 in flight.** Site-specific tuning of LinkedIn / Glassdoor
  adapters, resume diff preview, the Documents semantic-search index.

## Documentation index

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, state
  machine, data flow.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — why this stack.
- [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) — three-tier safety taxonomy.
- [`docs/MODELS.md`](docs/MODELS.md) — VRAM-driven model selection.
- [`backend/README.md`](backend/README.md) — the Python sidecar at a glance.
- [`backend/core/README.md`](backend/core/README.md) — kernel / config / safety / orchestrator.
- [`backend/memory/README.md`](backend/memory/README.md) — local persistence.
- [`backend/perception/README.md`](backend/perception/README.md) — what OMNI sees.
- [`backend/action/README.md`](backend/action/README.md) — what OMNI does.
- [`backend/workflow/README.md`](backend/workflow/README.md) — the job-application state machine.
- [`backend/voice/README.md`](backend/voice/README.md) — STT + TTS.
- [`backend/tools/README.md`](backend/tools/README.md) — build helpers.
- [`backend/tests/README.md`](backend/tests/README.md) — smoke tests.
- [`frontend/README.md`](frontend/README.md) — Tauri + React shell.
- [`frontend/src/README.md`](frontend/src/README.md) — TypeScript app.
- [`frontend/src/components/README.md`](frontend/src/components/README.md) — UI building blocks.
- [`frontend/public/README.md`](frontend/public/README.md) — static assets.
- [`frontend/src-tauri/README.md`](frontend/src-tauri/README.md) — the Rust shell.
- [`frontend/src-tauri/icons/README.md`](frontend/src-tauri/icons/README.md) — icon set.
- [`frontend/src-tauri/capabilities/README.md`](frontend/src-tauri/capabilities/README.md) — Tauri 2 permissions.
- [`data/README.md`](data/README.md) — local user state.
- [`data/voices/README.md`](data/voices/README.md) — Piper voices.
- [`data/snapshots/README.md`](data/snapshots/README.md) — VLM screenshots (transient).
- [`data/backups/README.md`](data/backups/README.md) — auto-backups.
- [`data/downloads/README.md`](data/downloads/README.md) — downloaded files.
- [`data/lance/README.md`](data/lance/README.md) — LanceDB tables.
- [`logs/README.md`](logs/README.md) — runtime logs.

---

OMNI is yours. Wipe `data/` to start over, hand-edit `data/config.json` if
you want, drop your own voices into `data/voices/`, swap the Qwen models
for any other Ollama model. The whole point of building this thing locally
was to keep the keys to it on your keyring.
