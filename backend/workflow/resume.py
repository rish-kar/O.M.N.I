"""Resume tailoring. Always works on a copy; never overwrites the master."""
from __future__ import annotations
import re
import shutil
from pathlib import Path

from ..action.files import docx_replace
from ..core.config import DOWNLOADS
from ..core.logging import get

log = get("omni.resume")


def _safe_name(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_") or "Job"


def job_specific_path(company: str, role: str, master: Path) -> Path:
    folder = DOWNLOADS / "resumes" / _safe_name(f"{company}_{role}")
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{_safe_name(company)}_{_safe_name(role)}_Resume{master.suffix}"


async def tailor(master_path: str | Path, company: str, role: str,
                 replacements: dict[str, str]) -> Path:
    master = Path(master_path)
    if not master.exists():
        raise FileNotFoundError(master)
    dst = job_specific_path(company, role, master)
    if master.suffix.lower() == ".docx":
        await docx_replace(master, dst, replacements)
    else:
        shutil.copy2(master, dst)
        log.warning("non-docx resume copied without edits: %s", dst)
    return dst
