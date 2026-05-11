"""External application form fill - uses memory + ask-on-unknown."""
from __future__ import annotations
from typing import Optional

from playwright.async_api import Page

from ..core.logging import get
from ..core.safety import gate, Action, Tier, Denied
from ..memory import store as mem

log = get("omni.apply")


SENSITIVE = {
    "salary", "expected salary", "current salary",
    "sponsorship", "visa", "work authorization", "right to work",
    "disability", "ethnicity", "gender", "veteran",
    "criminal", "convicted",
    "notice period", "start date",
    "references",
}


def is_sensitive(question: str) -> bool:
    q = question.lower()
    return any(s in q for s in SENSITIVE)


async def answer_question(question: str, *, site: str) -> str:
    """Returns answer text, asking the user when missing or sensitive.

    The frontend sends `value: { value: <string>, save: <bool> }` for
    unknown_answer prompts. We unwrap that here so callers get a string.
    """
    cached: Optional[str] = None
    if not is_sensitive(question):
        cached = mem.find_answer(question, site=site)
        if cached:
            return cached
    res = await gate.gate(Action(
        "form.unknown_answer", Tier.HARD,
        {"site": site, "question": question, "sensitive": is_sensitive(question)},
        suggested=cached,
    ))
    inner = (res or {}).get("value") or {}
    if isinstance(inner, str):
        # fallback if UI sent a raw string
        return inner
    val = inner.get("value", "") if isinstance(inner, dict) else ""
    save = bool(inner.get("save")) if isinstance(inner, dict) else False
    if val and save:
        mem.save_answer(question, val, site=site, sensitive=is_sensitive(question))
    return val


async def upload_file(page: Page, selector: str, path: str) -> None:
    await gate.gate(Action("form.upload", Tier.ACT, {"selector": selector, "path": path}))
    el = await page.query_selector(selector)
    if not el:
        raise RuntimeError(f"upload field not found: {selector}")
    await el.set_input_files(path)


async def confirm_submit(summary: dict) -> bool:
    try:
        await gate.gate(Action(
            "form.submit", Tier.HARD, summary,
            suggested="Final submit on external site",
        ))
        return True
    except Denied:
        return False
