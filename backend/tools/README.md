# `backend/tools/` — build helpers

Small utilities that aren't part of the runtime. Things you run once during
setup or release.

## Files

| File | Responsibility |
| --- | --- |
| `make_icons.py` | Generates the Tauri icon set (.png / .ico / .icns) from `frontend/public/icon.svg`. Tauri requires icons of specific sizes; this script keeps them in sync with the source SVG. |

## Usage

```powershell
# One-shot: regenerate all icons from the SVG.
.\.venv\Scripts\python.exe -m backend.tools.make_icons --force
```

Run this whenever the logo SVG changes. The output drops into
`frontend/src-tauri/icons/`.
