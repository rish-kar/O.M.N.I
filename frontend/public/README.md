# `frontend/public/` — static web assets

Vite serves anything here at the web root.

## Files

| File | Responsibility |
| --- | --- |
| `icon.svg` | The OMNI favicon. Mirrors the in-app `<Logo />` component — orbital ring + omega glyph + blue→orange gradient. Update both files together when changing the logo. |

The Tauri-side icon set (.png / .ico / .icns) is generated from this SVG via
`backend/tools/make_icons.py` and lives at `frontend/src-tauri/icons/`.
