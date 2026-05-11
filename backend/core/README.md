# `backend/core/` — kernel of OMNI

Everything that every other module depends on. Configuration, the LLM client,
the safety gate, the orchestrator, the in-process event bus, hardware
detection, and logging all live here.

## Files

| File | Responsibility |
| --- | --- |
| `config.py` | Pydantic-settings models (`Paths`, `Permissions`, `Preferences`, `Browser`, `Personality`, `Voice`, `ModelProfile`) persisted as `data/config.json`. Exposes the singleton `settings`. |
| `llm.py` | Async `Ollama` client. Handles `chat`, `generate` (text + image), `embed`. The only path to inference. |
| `safety.py` | Three-tier permission gate (`READ`, `ACT`, `HARD`), pause/resume, emergency-stop. Blocks every Tier-2/3 action until the user (or a saved rule) approves. Publishes `permission_request` events. |
| `orchestrator.py` | Top-level state-machine driver for one job-search session. Calls into `workflow/`, emits events, handles `Denied` / errors gracefully. |
| `events.py` | In-process pub/sub. The WebSocket endpoint subscribes here and forwards every event to the UI. |
| `hardware.py` | Detects GPU VRAM (NVML / `nvidia-smi`) and picks the right model profile (`text_fast` / `text_reason` / `text_deep` + vision). |
| `logging.py` | Rotating file logger + Rich console output. Use `core.logging.get("omni.<name>")` everywhere. |

## Personality

`Personality.system_prompt()` builds the live system prompt used by every chat
call. Tone, humor, verbosity, and your custom instructions are baked in — change
them from the **Settings → Personality** modal in the UI and OMNI picks the new
prompt up on the next message.

## Safety gate

The gate is the heart of OMNI's privacy story. Three tiers:

- **READ** — no prompt. Local file reads in allowed folders, screenshots, etc.
- **ACT** — prompts unless the action's domain/path is already trusted.
- **HARD** — always prompts. Final form submit, sending money, indexing a
  brand-new folder, internet on an unknown domain, sensitive answers.

`gate.gate(Action(...))` is the only entry point. It awaits a user decision
through the WebSocket, supports timeouts, and raises `Denied` on rejection.

## Adding a new tier-2 action

```python
from backend.core.safety import gate, Action, Tier

await gate.gate(Action("my.new.action", Tier.ACT, {"target": foo}))
```

That's it. The toast pops in the UI, the user approves or skips, the call
returns or raises `Denied`. Audit-logged automatically.

## Env

```
OMNI_HOST=127.0.0.1
OMNI_PORT=8765
OMNI_LOG_LEVEL=INFO
OMNI_OLLAMA_HOST=http://127.0.0.1:11434
```
