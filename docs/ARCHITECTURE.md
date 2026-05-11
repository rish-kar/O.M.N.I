# OMNI Architecture

## Component diagram

```
┌──────────────────────── Tauri Shell (Rust) ────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  React UI (chat, dashboard, perms, memory viewer, voice)    │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  Tray • Notifications • Hotkeys • Permission prompts              │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTP/WS 127.0.0.1:8765
                ┌──────────────▼──────────────┐
                │   FastAPI Sidecar (Python)  │
                │ ┌─────────────────────────┐ │
                │ │     Orchestrator        │ │
                │ │  (state machine + plan) │ │
                │ └────┬───────────┬────────┘ │
                │      │           │          │
                │  ┌───▼────┐ ┌────▼────┐    │
                │  │ Memory │ │  Safety │    │
                │  └────────┘ └─────────┘    │
                │  ┌────────┐ ┌─────────┐    │
                │  │  LLM   │ │  VLM    │    │
                │  │ Ollama │ │ Ollama  │    │
                │  └────────┘ └─────────┘    │
                │ ┌─────────┐ ┌──────────┐   │
                │ │Perception│ │ Action  │   │
                │ │ screen   │ │mouse/kbd│   │
                │ │ ocr      │ │playwright│  │
                │ └─────────┘ └──────────┘   │
                │ ┌────────┐  ┌──────────┐   │
                │ │ Voice  │  │  Files   │   │
                │ │ STT/TTS│  │docx/xlsx │   │
                │ └────────┘  └──────────┘   │
                └─────────────────────────────┘
```

## State machine

`IDLE → PREPARE → SEARCH_JOBS → EXTRACT_JD → SEND_TO_CHATGPT_TAB → UPDATE_TRACKER → TAILOR_RESUME → APPLY_ON_SITE → FINAL_REVIEW → SUBMIT_OR_SAVE → MEMORY_UPDATE → DONE`

Plus `ERROR_RECOVERY` reachable from any state, and `PAUSED` (user-triggered).

## Memory schema (SQLite)

- `profile` — single row (user, paths, prefs, sponsorship/auth wording)
- `jobs` — every job seen
- `applications` — every application attempt
- `answers` — approved form answers (encrypted)
- `procedures` — learned site/page workflows
- `documents` — indexed local files (resumes, CLs, repos)
- `audit` — append-only action log
- `conversations` — chat history
- `permissions` — granted folder/site/internet permissions

Vector index (LanceDB): per-table embeddings for jobs, documents, answers, procedures, conversations.

## Permission model

Three escalation tiers:
1. **Read-only ambient** — screen watch (when toggled), local file index (allowlisted folders).
2. **Action with prompt** — mouse/kbd, browser navigation, file write (always backed up).
3. **Hard gate** — final submit, sensitive form answer, internet on new domain, indexing new folder, CAPTCHA.

Every Tier-2/3 action passes through `safety.gate(action)` and is logged to `audit`.

## Screen vision loop

```
capture_region → preprocess → VLM(image, instruction) → action proposal
              → safety.gate → execute → capture_after → VLM(verify) → log
```

Screenshots are deleted after processing per user requirement.

## ChatGPT-tab orchestration

The agent does NOT call OpenAI API. It drives the ChatGPT web UI in 8 already-logged-in Chrome tabs via Playwright + screen vision fallback. Prompt template lives in `backend/workflow/chatgpt_tabs.py`.
