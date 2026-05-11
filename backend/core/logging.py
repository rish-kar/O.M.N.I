"""Structured logging — truncates logs/omni.log on each run."""
from __future__ import annotations
import logging
import sys
from .config import LOGS, settings

_FMT = "%(asctime)s [%(levelname)s] %(name)s :: %(message)s"


def setup() -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    root.setLevel(settings.log_level)

    # Truncate the log file on every run so it stays small and current-only.
    fh = logging.FileHandler(LOGS / "omni.log", mode="w", encoding="utf-8")
    fh.setFormatter(logging.Formatter(_FMT))
    root.addHandler(fh)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter(_FMT))
    root.addHandler(sh)


def get(name: str) -> logging.Logger:
    setup()
    return logging.getLogger(name)
