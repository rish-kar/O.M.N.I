# `backend/action/` — what OMNI does

The hands. Mouse, keyboard, browser, files. Every Tier-2/3 call here passes
through `core.safety.gate` first.

## Files

| File | Responsibility |
| --- | --- |
| `browser.py` | Playwright Chrome controller. Attaches to an existing CDP Chrome (recommended), launches Chrome with the persistent OMNI profile (your logins survive), or falls back to ephemeral managed Chromium. Opens new pages as **tabs in the existing context** so your bookmarks + passwords are reused. |
| `input.py` | `pyautogui` / `pywinauto` keyboard + mouse. Always gated. |
| `files.py` | DOCX / XLSX / PDF read + safe write. Every write makes a backup in `data/backups/` first. `tracker_append` is the public helper for appending a row to your tracker. |

## Connecting Chrome — the order of operations

1. `Chrome.attach_or_launch()` first checks the configured CDP endpoint (and
   `127.0.0.1:9222`). If alive — **attach to your existing window** and reuse
   its open context. Your tabs / cookies / extensions are all there.
2. If no CDP endpoint is reachable and `browser.launch_managed` is true,
   OMNI launches your installed Chrome with `--remote-debugging-port=9222`
   and a persistent user-data-dir at `%LOCALAPPDATA%\OMNI\chrome-profile`.
   Sign in once; the profile persists between sessions.
3. As a last resort, an ephemeral Playwright-managed Chromium starts. No
   logins survive across runs.

`Chrome.goto(url, in_new_tab=True)` (default) opens a new tab inside the
attached context — never a fresh window.

## File safety

Every write goes through `backup(path)` first, which copies the file to
`data/backups/<filename>.<timestamp>.bak`. That includes:

- Resume tailoring (master copy is never touched — OMNI works on a per-job copy)
- Tracker appends
- Cover-letter writes (each application gets its own file)

## Adding a new tier-2 action

```python
from backend.core.safety import gate, Action, Tier
await gate.gate(Action("file.write", Tier.ACT, {"path": str(dst)}))
backup(dst)
... write ...
```
