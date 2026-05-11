"""Detect VRAM and pick a sensible model profile at startup."""
from __future__ import annotations
import shutil
import subprocess
from .logging import get

log = get("omni.hw")


def detect_vram_gb() -> float:
    """Return primary GPU VRAM in GB, or 0 if unknown."""
    nv = shutil.which("nvidia-smi")
    if not nv:
        return 0.0
    try:
        out = subprocess.check_output(
            [nv, "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            text=True, timeout=5,
        )
        mb = max(int(x.strip()) for x in out.splitlines() if x.strip())
        return round(mb / 1024, 1)
    except Exception as e:
        log.warning("nvidia-smi failed: %s", e)
        return 0.0


def choose_profile(vram_gb: float) -> dict[str, str]:
    """Pick text/vision models by VRAM. Conservative for laptop 4090 (16GB)."""
    if vram_gb >= 24:
        return {
            "text_fast": "qwen2.5:7b-instruct-q4_K_M",
            "text_reason": "qwen2.5:14b-instruct-q4_K_M",
            "text_deep": "qwen2.5:32b-instruct-q4_K_M",
            "vision": "qwen2.5vl:7b",
        }
    if vram_gb >= 14:
        return {
            "text_fast": "qwen2.5:7b-instruct-q4_K_M",
            "text_reason": "qwen2.5:14b-instruct-q4_K_M",
            "text_deep": "qwen2.5:14b-instruct-q4_K_M",
            "vision": "qwen2.5vl:7b",
        }
    if vram_gb >= 8:
        return {
            "text_fast": "qwen2.5:3b-instruct-q4_K_M",
            "text_reason": "qwen2.5:7b-instruct-q4_K_M",
            "text_deep": "qwen2.5:7b-instruct-q4_K_M",
            "vision": "qwen2.5vl:3b",
        }
    return {
        "text_fast": "qwen2.5:1.5b-instruct-q4_K_M",
        "text_reason": "qwen2.5:3b-instruct-q4_K_M",
        "text_deep": "qwen2.5:3b-instruct-q4_K_M",
        "vision": "qwen2.5vl:3b",
    }
