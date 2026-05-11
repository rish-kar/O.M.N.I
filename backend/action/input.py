"""Mouse / keyboard / clipboard. All routed through safety.gate()."""
from __future__ import annotations
import time
from typing import Optional

import pyautogui
import pyperclip

from ..core.safety import gate, Action, Tier
from ..core.logging import get

log = get("omni.input")
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05


async def click(x: int, y: int, button: str = "left", why: str = "") -> None:
    await gate.gate(Action("input.click", Tier.ACT, {"x": x, "y": y, "button": button, "why": why}))
    pyautogui.click(x=x, y=y, button=button)


async def move(x: int, y: int, duration: float = 0.2) -> None:
    await gate.gate(Action("input.move", Tier.ACT, {"x": x, "y": y}))
    pyautogui.moveTo(x, y, duration=duration)


async def type_text(text: str, interval: float = 0.01, paste: bool = True, why: str = "") -> None:
    await gate.gate(Action("input.type", Tier.ACT,
                           {"len": len(text), "preview": text[:40], "why": why}))
    if paste and len(text) > 60:
        pyperclip.copy(text)
        time.sleep(0.05)
        pyautogui.hotkey("ctrl", "v")
    else:
        pyautogui.write(text, interval=interval)


async def hotkey(*keys: str) -> None:
    await gate.gate(Action("input.hotkey", Tier.ACT, {"keys": list(keys)}))
    pyautogui.hotkey(*keys)


async def scroll(dy: int) -> None:
    await gate.gate(Action("input.scroll", Tier.ACT, {"dy": dy}))
    pyautogui.scroll(dy)


def copy_text(s: str) -> None:
    pyperclip.copy(s)


def paste_text() -> str:
    return pyperclip.paste()
