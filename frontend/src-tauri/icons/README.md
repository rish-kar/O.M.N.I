# `frontend/src-tauri/icons/` — application icon set

Tauri requires the app icon in many sizes and formats per platform. They're all
generated from `frontend/public/icon.svg` so the source of truth is one file.

## Files

| File | Used by |
| --- | --- |
| `32x32.png` / `128x128.png` / `128x128@2x.png` | Linux, generic |
| `icon.ico` | Windows installer + window icon |
| `icon.png` | macOS / Linux fallback |
| `Square*Logo.png`, `StoreLogo.png` | Windows Store / MSIX assets |

## Regenerating

When the logo SVG changes:

```powershell
.\.venv\Scripts\python.exe -m backend.tools.make_icons --force
```

The script reads `frontend/public/icon.svg` and rewrites every file in this
directory.
