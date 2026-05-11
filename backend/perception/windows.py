"""Active window / Chrome tab inspection."""
from __future__ import annotations
from typing import Optional

try:
    import pygetwindow as gw
except Exception:
    gw = None  # type: ignore

from ..core.logging import get

log = get("omni.win")


def active_title() -> Optional[str]:
    if not gw:
        return None
    try:
        w = gw.getActiveWindow()
        return w.title if w else None
    except Exception as e:
        log.warning("active_title: %s", e)
        return None


def find_chrome() -> list[str]:
    if not gw:
        return []
    try:
        return [w.title for w in gw.getAllWindows() if "Chrome" in (w.title or "")]
    except Exception:
        return []
