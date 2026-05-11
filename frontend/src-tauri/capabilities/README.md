# `frontend/src-tauri/capabilities/` — Tauri 2 permissions

Tauri 2 ships with a capability-based permission system: the renderer can only
call plugin APIs that have been explicitly granted here.

## Files

| File | Responsibility |
| --- | --- |
| `default.json` | The default capability set granted to every window. Lists the plugins (`shell`, `notification`, etc.) and the commands the React side may invoke. |

OMNI keeps the surface tight — only what the UI actually needs (tray, opening
external URLs in the user's default browser, sending OS notifications). Add a
permission only when a feature requires it.

## Reference

- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/reference/config/
