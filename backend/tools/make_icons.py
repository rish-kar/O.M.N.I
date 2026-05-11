"""Generate OMNI app icons (PNG + ICO) into frontend/src-tauri/icons/.

Idempotent: safe to re-run. Skips if icons already exist (use --force to regenerate).
"""
from __future__ import annotations
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend" / "src-tauri" / "icons"


def draw_icon(size: int) -> Image.Image:
    """A small futuristic ring + omega glyph - readable at 16x16."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size

    # Soft glow background
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((s * 0.05, s * 0.05, s * 0.95, s * 0.95),
               fill=(122, 252, 255, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.06))
    img.alpha_composite(glow)

    # Outer ring
    ring_w = max(2, s // 32)
    d.ellipse((s * 0.08, s * 0.08, s * 0.92, s * 0.92),
              outline=(122, 252, 255, 255), width=ring_w)

    # Inner filled disc
    d.ellipse((s * 0.20, s * 0.20, s * 0.80, s * 0.80),
              fill=(11, 13, 20, 255))

    # Omega glyph (drawn with arcs and feet)
    # Arc top
    d.arc((s * 0.30, s * 0.27, s * 0.70, s * 0.78),
          start=200, end=-20, fill=(122, 252, 255, 255), width=max(2, s // 22))
    # Feet
    d.line((s * 0.30, s * 0.66, s * 0.27, s * 0.74),
           fill=(122, 252, 255, 255), width=max(2, s // 22))
    d.line((s * 0.70, s * 0.66, s * 0.73, s * 0.74),
           fill=(122, 252, 255, 255), width=max(2, s // 22))

    return img


def write_pngs(force: bool = False) -> list[Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }
    written: list[Path] = []
    for name, size in targets.items():
        p = OUT / name
        if p.exists() and not force:
            continue
        img = draw_icon(size)
        img.save(p, "PNG")
        written.append(p)
    return written


def write_ico(force: bool = False) -> Path:
    p = OUT / "icon.ico"
    if p.exists() and not force:
        return p
    sizes = [16, 32, 48, 64, 128, 256]
    base = draw_icon(256)
    base.save(p, "ICO", sizes=[(s, s) for s in sizes])
    return p


def main() -> None:
    force = "--force" in sys.argv
    pngs = write_pngs(force=force)
    ico = write_ico(force=force)
    if pngs:
        print(f"Generated {len(pngs)} PNG icons in {OUT}")
    else:
        print(f"PNG icons already present in {OUT}")
    print(f"ICO: {ico}")


if __name__ == "__main__":
    main()
