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


def grab(region: Optional[Region] = None) -> Image.Image:
    """Capture screen or region as Pillow Image (RGB)."""
    with mss.mss() as sct:
        mon = (
            {"left": region.left, "top": region.top,
             "width": region.width, "height": region.height}
            if region else sct.monitors[1]
        )
        raw = sct.grab(mon)
        return Image.frombytes("RGB", raw.size, raw.rgb)


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
