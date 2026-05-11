"""Screen capture + VLM-driven understanding. Screenshots are deleted after use."""
from __future__ import annotations
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import mss
from PIL import Image

from ..core.config import SNAPSHOTS, settings
from ..core.llm import llm
from ..core.logging import get

log = get("omni.screen")


@dataclass
class Region:
    left: int
    top: int
    width: int
    height: int


def _resize_for_vlm(img: Image.Image, max_dim: int = 1280) -> Image.Image:
    """Shrink image so neither dimension exceeds max_dim (preserves aspect ratio)."""
    w, h = img.size
    if max(w, h) <= max_dim:
        return img
    ratio = max_dim / max(w, h)
    return img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)


def grab(region: Optional[Region] = None) -> Image.Image:
    """Capture the combined virtual screen (all monitors) or a specific region."""
    with mss.mss() as sct:
        mon = (
            {"left": region.left, "top": region.top,
             "width": region.width, "height": region.height}
            if region else sct.monitors[0]  # monitors[0] = combined virtual screen
        )
        raw = sct.grab(mon)
        return Image.frombytes("RGB", raw.size, raw.rgb)


def grab_all_monitors() -> list[Image.Image]:
    """Capture each physical monitor separately, resized for VLM processing."""
    with mss.mss() as sct:
        images = []
        monitors = sct.monitors[1:]  # skip [0] which is the combined virtual screen
        if not monitors:
            monitors = sct.monitors  # fallback: single combined
        for mon in monitors:
            raw = sct.grab(mon)
            img = Image.frombytes("RGB", raw.size, raw.rgb)
            images.append(_resize_for_vlm(img))
        return images


def save_temp(img: Image.Image, name: str = "shot") -> Path:
    p = SNAPSHOTS / f"{name}_{int(time.time()*1000)}.png"
    img.save(p, "PNG")
    return p


def cleanup(*paths: Path) -> None:
    for p in paths:
        try:
            Path(p).unlink(missing_ok=True)
        except Exception as e:
            log.warning("cleanup %s: %s", p, e)


async def describe(img: Image.Image, instruction: str = "Describe the screen and list interactive elements with bounding boxes if visible.") -> str:
    """Pass screenshot to local VLM. Returns text description."""
    return await llm.generate(
        prompt=instruction, model=settings.profile.vision, images=[img], temperature=0.1
    )


async def propose_action(img: Image.Image, goal: str) -> str:
    """Ask VLM what to click/type next to advance toward `goal`. Returns JSON-ish text."""
    prompt = (
        f"You are operating a computer. Goal: {goal}\n"
        "Inspect the screenshot and respond with a single JSON action of the form:\n"
        '{"type":"click","x":int,"y":int,"why":"..."}\n'
        '{"type":"type","text":"...","why":"..."}\n'
        '{"type":"scroll","dy":int,"why":"..."}\n'
        '{"type":"done","why":"..."}\n'
        '{"type":"ask_user","question":"...","why":"..."}\n'
        "Return only the JSON, no prose."
    )
    return await llm.generate(prompt=prompt, model=settings.profile.vision, images=[img], temperature=0.1)
