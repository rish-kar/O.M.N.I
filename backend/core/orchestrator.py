"""Top-level agent loop. Drives the state machine for one job-search session."""
from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from .config import settings
from .events import bus
from .logging import get
from .safety import Denied, gate
from ..action.browser import chrome
from ..action.files import tracker_append
from ..memory import store as mem
from ..workflow import chatgpt_tabs, job_search
from ..workflow.states import State, can_transition

log = get("omni.orch")


@dataclass
class SessionParams:
    query: str
    location: str
    sources: list[str] = field(default_factory=lambda: ["linkedin", "glassdoor"])
    batch_size: int = 8
    avoid_easy_apply: bool = True


class Orchestrator:
    def __init__(self) -> None:
        self.state = State.IDLE
        self._task: Optional[asyncio.Task] = None
        self.last_summary: dict = {}

    async def _set(self, s: State) -> None:
        if (
            s != self.state
            and not can_transition(self.state, s)
            and s not in (State.PAUSED, State.ERROR_RECOVERY, State.IDLE)
        ):
            log.warning("invalid transition %s -> %s", self.state, s)
        self.state = s
        await bus.publish("state", {"state": s.value})

    async def start(self, p: SessionParams) -> None:
        if self._task and not self._task.done():
            raise RuntimeError("session already running")
        gate.reset_stop()
        self._task = asyncio.create_task(self._run(p))

    def stop(self) -> None:
        gate.emergency_stop()

    def pause(self) -> None:
        gate.pause()

    def resume(self) -> None:
        gate.resume()

    async def _run(self, p: SessionParams) -> None:
        try:
            await self._set(State.PREPARE)
            await self._prepare(p)

            await self._set(State.SEARCH_JOBS)
            leads = await job_search.search_all(
                p.query, p.location, sources=p.sources,
                avoid_easy_apply=p.avoid_easy_apply,
            )
            leads = leads[: p.batch_size]
            if not leads:
                await bus.publish("warning", {"msg": "No leads found."})
                await self._set(State.DONE)
                return
            await bus.publish("leads", {
                "count": len(leads),
                "items": [l.__dict__ for l in leads],
            })

            await self._set(State.EXTRACT_JD)
            jds = await self._extract_jds(leads)

            await self._set(State.SEND_TO_CHATGPT_TAB)
            try:
                results = await chatgpt_tabs.run_batch([
                    {"url": j["url"], "company": l.company, "role": l.title,
                     "location": l.location, "jd": j["jd_text"]}
                    for l, j in zip(leads, jds)
                ])
            except RuntimeError as e:
                # No ChatGPT tabs detected - degrade gracefully
                log.warning("ChatGPT batch unavailable: %s", e)
                await bus.publish("warning", {
                    "msg": "No ChatGPT tabs detected. Open chatgpt.com tabs in the attached "
                           "Chrome and re-run, or skip evaluation.",
                })
                results = []

            await self._set(State.UPDATE_TRACKER)
            for i, lead in enumerate(leads):
                jd = jds[i] if i < len(jds) else {}
                res = results[i] if i < len(results) else None
                await self._handle_result(lead, jd, res)

            await self._set(State.MEMORY_UPDATE)
            await self._set(State.DONE)
        except Denied as d:
            log.warning("session denied: %s", d)
            await bus.publish("warning", {"msg": f"Action denied: {d}"})
            await self._set(State.ERROR_RECOVERY)
        except Exception as e:
            log.exception("session error: %s", e)
            await bus.publish("error", {"msg": str(e)})
            await self._set(State.ERROR_RECOVERY)
        finally:
            await self._set(State.IDLE)

    async def _prepare(self, p: SessionParams) -> None:
        warnings = []
        if not settings.paths.tracker_xlsx:
            warnings.append("tracker_xlsx not configured - tracker updates will be skipped")
        if not settings.paths.resume_master:
            warnings.append("resume_master not configured - resume tailoring will be skipped")
        if not settings.perms.internet:
            warnings.append("Internet permission is OFF - enable it in the sidebar")
        for w in warnings:
            await bus.publish("warning", {"msg": w})

        # Attach or launch Chrome.
        try:
            mode = await chrome.attach_or_launch()
            await bus.publish("info", {"msg": f"Chrome mode: {mode}"})
        except Exception as e:
            log.exception("Chrome attach/launch failed")
            raise RuntimeError(f"Chrome unavailable: {e}")

    async def _extract_jds(self, leads: list) -> list[dict]:
        out = []
        for lead in leads:
            try:
                jd = await job_search.extract_jd(lead.url)
                merged = {**lead.__dict__, **jd}
                mem.upsert_job(merged)
                out.append(jd)
            except Exception as e:
                log.warning("extract %s failed: %s", lead.url, e)
                out.append({"url": lead.url, "title": lead.title, "jd_text": ""})
        return out

    async def _handle_result(self, lead, jd, res) -> None:
        score = getattr(res, "score", None) if res else None
        verdict = getattr(res, "verdict", "") if res else ""
        salary = getattr(res, "salary", "") if res else ""
        cl_path = getattr(res, "cover_letter_path", "") if res else ""

        if settings.paths.tracker_xlsx:
            try:
                await tracker_append(settings.paths.tracker_xlsx, {
                    "date": date.today().isoformat(),
                    "company": lead.company, "role": lead.title,
                    "location": lead.location, "url": lead.url, "source": lead.source,
                    "score": score if score is not None else "",
                    "verdict": verdict,
                    "cover_letter_path": cl_path or "",
                    "resume_path": "",
                    "status": "Pending review",
                    "notes": salary or "",
                })
            except Denied:
                log.info("tracker append denied")

        await bus.publish("application_evaluated", {
            "company": lead.company, "role": lead.title, "url": lead.url,
            "score": score, "verdict": verdict,
        })


orchestrator = Orchestrator()
