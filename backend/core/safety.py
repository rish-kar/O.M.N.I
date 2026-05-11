"""Permission gate. Every Tier-2/3 action passes through gate()."""
from __future__ import annotations
import asyncio
import fnmatch
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from .config import settings
from .events import bus
from .logging import get

log = get("omni.safety")


class Tier(str, Enum):
    READ = "read"          # ambient (screen watch, allowed-folder index)
    ACT = "act"            # mouse/kbd, navigation, file write w/ backup
    HARD = "hard"          # final submit, sensitive answer, internet new domain


@dataclass
class Action:
    kind: str
    tier: Tier
    detail: dict[str, Any]
    suggested: Optional[str] = None


class Denied(Exception):
    """User denied or auto-deny rule blocked the action."""


class SafetyGate:
    """Mediator between code and user. Holds pending prompts keyed by id."""

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future] = {}
        self._emergency_stop = asyncio.Event()
        self._paused = asyncio.Event()

    # pause / stop
    def emergency_stop(self) -> None:
        log.warning("EMERGENCY STOP")
        self._emergency_stop.set()

    def reset_stop(self) -> None:
        self._emergency_stop.clear()

    def pause(self) -> None:
        self._paused.set()

    def resume(self) -> None:
        self._paused.clear()

    @property
    def stopped(self) -> bool:
        return self._emergency_stop.is_set()

    async def checkpoint(self) -> None:
        if self._emergency_stop.is_set():
            raise Denied("emergency stop")
        while self._paused.is_set():
            await asyncio.sleep(0.1)
            if self._emergency_stop.is_set():
                raise Denied("emergency stop")

    # auto-rules
    def folder_allowed(self, path: str | Path) -> bool:
        try:
            p = str(Path(path).resolve()).lower()
        except Exception:
            return False
        for d in settings.perms.denied_folders:
            if fnmatch.fnmatch(p, d.lower()):
                return False
        if not settings.perms.allowed_folders:
            return False
        return any(fnmatch.fnmatch(p, a.lower() + "*") for a in settings.perms.allowed_folders)

    def domain_trusted(self, url: str) -> bool:
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower()
        return any(host == s or host.endswith("." + s) for s in settings.perms.trusted_sites)

    async def _audit(self, action: Action, decision: str) -> None:
        """Emit a single audit event with a string decision."""
        await bus.publish("audit", {
            "action": action.kind,
            "tier": action.tier.value,
            "detail": action.detail,
            "decision": decision,
        })

    # gate
    async def gate(self, action: Action, timeout: float = 120.0) -> Any:
        """Ask UI; raise Denied if user rejects or times out.

        Returns the answer dict ({approved, value, reason}) on approval, or
        None for auto-allowed READ/auto-rule cases.
        """
        await self.checkpoint()

        if action.tier == Tier.READ:
            await self._audit(action, "auto")
            return None

        # auto-rules for ACT
        if action.tier == Tier.ACT:
            if action.kind == "browser.navigate":
                if settings.perms.internet and self.domain_trusted(action.detail.get("url", "")):
                    await self._audit(action, "auto")
                    return None
            if action.kind == "file.read":
                if self.folder_allowed(action.detail.get("path", "")):
                    await self._audit(action, "auto")
                    return None

        pid = uuid4().hex
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[pid] = fut
        await bus.publish("permission_request", {
            "id": pid,
            "kind": action.kind,
            "tier": action.tier.value,
            "detail": action.detail,
            "suggested": action.suggested,
        })
        try:
            answer = await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError:
            await self._audit(action, "timeout")
            raise Denied(f"timeout: {action.kind}")
        finally:
            self._pending.pop(pid, None)

        approved = answer.get("approved") is True
        await self._audit(action, "approved" if approved else "denied")
        if not approved:
            raise Denied(answer.get("reason", "denied"))
        return answer

    def respond(self, pid: str, approved: bool, value: Any = None, reason: str = "") -> bool:
        fut = self._pending.get(pid)
        if not fut or fut.done():
            return False
        fut.set_result({"approved": approved, "value": value, "reason": reason})
        return True


gate = SafetyGate()
