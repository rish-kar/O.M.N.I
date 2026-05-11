"""8-tab ChatGPT web orchestration. NEVER calls OpenAI API."""
from __future__ import annotations
import asyncio
import re
from dataclasses import dataclass
from typing import Optional

from playwright.async_api import Page

from ..core.logging import get
from ..core.safety import gate, Action, Tier
from ..action.browser import chrome

log = get("omni.chatgpt")


PROMPT_TEMPLATE = """Evaluate this job using my existing project rules.

Job URL:
{url}

Company:
{company}

Role:
{role}

Location:
{location}

Job Description:
{jd}

Required output:
1. Score out of 10 using my job-matching framework.
2. Short apply/skip verdict.
3. Salary range if available.
4. JD keywords missing from my resume.
5. Exact resume lines to update, with minimal truthful changes only.
6. Generate a tailored one-page cover letter as downloadable DOCX if score is 5 or above.
7. Keep output short and section-wise."""


@dataclass
class ChatGPTResult:
    score: Optional[float]
    verdict: str
    salary: Optional[str]
    missing_keywords: list[str]
    resume_changes: list[dict]
    raw: str
    cover_letter_path: Optional[str] = None


async def get_tabs() -> list[Page]:
    if chrome.ctx is None:
        await chrome.attach_or_launch()
    tabs = await chrome.chatgpt_tabs()
    if not tabs:
        raise RuntimeError(
            "No ChatGPT tabs detected. Open chatgpt.com in the attached Chrome."
        )
    return tabs


async def send_prompt(page: Page, prompt: str, wait_s: int = 90) -> str:
    """Paste prompt into ChatGPT composer; wait for completion; return last assistant text."""
    await gate.gate(Action(
        "chatgpt.send", Tier.ACT,
        {"url": page.url, "preview": prompt[:120]},
    ))

    composer_selectors = [
        "div#prompt-textarea",
        "div[contenteditable='true']",
        "textarea[data-id='root']",
        "textarea",
    ]
    box = None
    for sel in composer_selectors:
        try:
            box = await page.wait_for_selector(sel, timeout=4_000)
            if box:
                break
        except Exception:
            continue
    if not box:
        raise RuntimeError("ChatGPT composer not found")

    await box.click()
    await page.keyboard.insert_text(prompt)
    await page.keyboard.press("Enter")

    # Wait for streaming to complete: stop button disappears, copy button appears,
    # or message count stabilises for >= 6s.
    last_count = 0
    stable = 0
    deadline = wait_s
    msgs: list = []
    while deadline > 0:
        await asyncio.sleep(2)
        deadline -= 2
        try:
            msgs = await page.query_selector_all(
                "[data-message-author-role='assistant']"
            )
        except Exception:
            msgs = []

        # If a stop-streaming button is gone and we have messages, treat as done.
        try:
            stop_btn = await page.query_selector(
                "button[aria-label='Stop streaming'], button[data-testid='stop-button']"
            )
        except Exception:
            stop_btn = None

        if len(msgs) > last_count:
            last_count = len(msgs)
            stable = 0
        else:
            stable += 2

        if msgs and stop_btn is None and stable >= 4:
            break
        if stable >= 8 and msgs:
            break

    if not msgs:
        return ""
    try:
        return (await msgs[-1].inner_text()).strip()
    except Exception:
        return ""


def parse(raw: str) -> ChatGPTResult:
    score_m = re.search(r"score[^\d]*(\d+(?:\.\d+)?)\s*/\s*10", raw, re.I)
    score = float(score_m.group(1)) if score_m else None
    verdict_m = re.search(r"verdict[^\n]*[:\-]\s*(apply|skip|maybe)", raw, re.I)
    verdict = verdict_m.group(1).lower() if verdict_m else ""
    salary_m = re.search(r"salary[^\n]*[:\-]\s*([^\n]+)", raw, re.I)
    salary = salary_m.group(1).strip() if salary_m else None
    kw_m = re.search(r"missing[^\n]*[:\-]\s*([^\n]+)", raw, re.I)
    missing_raw = kw_m.group(1).split(",") if kw_m else []
    missing = [w.strip().strip("-* ") for w in missing_raw if w.strip()]
    return ChatGPTResult(
        score=score, verdict=verdict, salary=salary,
        missing_keywords=missing, resume_changes=[], raw=raw,
    )


async def run_one(page: Page, *, url: str, company: str, role: str,
                  location: str, jd: str) -> ChatGPTResult:
    prompt = PROMPT_TEMPLATE.format(
        url=url, company=company, role=role, location=location, jd=jd[:8000]
    )
    raw = await send_prompt(page, prompt)
    return parse(raw)


async def run_batch(jobs: list[dict]) -> list[ChatGPTResult]:
    """Distribute up to 8 jobs across available ChatGPT tabs in parallel."""
    tabs = await get_tabs()
    n = min(len(tabs), len(jobs), 8)
    if n == 0:
        return []
    sem = asyncio.Semaphore(n)

    async def _runner(page: Page, job: dict) -> ChatGPTResult:
        async with sem:
            try:
                return await run_one(page, **job)
            except Exception as e:
                log.warning("chatgpt run on %s failed: %s", job.get("url"), e)
                return ChatGPTResult(
                    score=None, verdict="", salary=None,
                    missing_keywords=[], resume_changes=[],
                    raw=f"error: {e}",
                )

    return await asyncio.gather(*[_runner(tabs[i], jobs[i]) for i in range(n)])
