# OMNI permission model

Every agent action is one of three tiers, evaluated by `core.safety.gate`.

## Tier READ

Ambient observation. Auto-allowed; logged to `audit`.

| Action | Notes |
|--------|-------|
| `screen.capture` | Only when `perms.screen_watch=true`. |
| `file.list` | Only inside `perms.allowed_folders`. |
| `index.scan` | Allowlisted folders only. |

## Tier ACT

Side-effects on local state. Auto-allowed when:

- `browser.navigate` → URL hostname is in `perms.trusted_sites` AND `perms.internet=true`.
- `file.read` → path under `perms.allowed_folders`.
- `file.write` → path under `perms.allowed_folders` AND a backup has been written first.

Otherwise, a permission prompt is published to the UI; the agent awaits the user's choice (`approve` / `skip`).

| Action | Auto-rule | Default UI prompt |
|--------|-----------|-------------------|
| `input.click`, `input.move`, `input.type`, `input.scroll`, `input.hotkey` | None | yes |
| `browser.navigate` | trusted+internet | yes |
| `file.read` | allowlisted folder | yes |
| `file.write` | allowlisted folder + backup taken | yes |
| `chatgpt.send` | None | yes |
| `form.upload` | None | yes |

## Tier HARD

Cannot be auto-allowed. Always asks. Times out after 120s = denied.

| Action | Why hard |
|--------|----------|
| `form.submit` | Final submission to a job site. |
| `form.unknown_answer` | Answer not in memory or sensitive. |
| `internet.new_domain` | First-time visit to a non-trusted site. |
| `index.new_folder` | Indexing a folder not on the allowlist. |
| `memory.export`, `memory.delete` | Bulk memory ops. |
| `captcha` | Always denied — never bypass. |

## Emergency stop

Hotkey `Ctrl+Shift+Esc` (registered by Tauri shell) calls
`POST /session/stop`. The orchestrator drops to `IDLE` after the current
checkpoint; any pending `gate.gate()` raises `Denied`.

## Audit

Every gate evaluation writes one row to `audit`:

```
ts | actor=agent | action=<kind> | tier=read|act|hard | detail_json | decision=auto|approved|denied|timeout
```

The UI streams these via WebSocket `kind:"audit"` events and displays them in the bottom-right Audit panel.
