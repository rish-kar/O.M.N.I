# `frontend/src/` — React shell

The TypeScript / React app rendered inside the Tauri webview.

## Files

| File | Responsibility |
| --- | --- |
| `main.tsx` | React entry. Mounts `<App/>` into `#root`. |
| `App.tsx` | Top-level layout. Header (logo, status bar, help, settings buttons), sidebar, dashboard, chat. Owns the onboarding-tour and settings-modal mount points. |
| `api.ts` | Thin fetch wrapper around the FastAPI backend on `127.0.0.1:8765`. Includes the WebSocket reconnector and the voice (`/voice/*`) helpers. |
| `store.ts` | Zustand store. Holds health, status, perms, paths, prefs, browser, **personality**, **voice**, chat messages, leads, audit, prompts, toasts. Single dispatcher `applyEvent` for incoming WS events. |
| `styles.css` | Global Tailwind layer + the animated background, glass panel, gradient buttons, scrollbar, motion-reduction guard. |
| `components/` | UI building blocks (one README in there). |

## Data flow

```
user click ─► component ─► api.* ─► fetch ─► backend
                                        │
                                        ▼ (push)
                                 WS /ws
                                        │
                                        ▼
                                store.applyEvent(...)
                                        │
                                        ▼
                                  components rerender
```

`App.tsx` polls `/health` + `/status` every 5 s on top of the WS push, so the
UI stays consistent even if a single message is dropped.

## Adding a new screen

1. Drop the component into `components/`.
2. Add any required state to `store.ts`.
3. Wire up the API call in `api.ts`.
4. Mount inside `App.tsx`.

Keep server state in the store; keep ephemeral form state in `useState` inside
the component.
