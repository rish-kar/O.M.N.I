"""In-process event bus for backend → UI WebSocket fan-out."""
from __future__ import annotations
import asyncio
from typing import Any
from collections import defaultdict


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, channel: str = "*") -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=512)
        self._subs[channel].add(q)
        return q

    def unsubscribe(self, channel: str, q: asyncio.Queue) -> None:
        self._subs.get(channel, set()).discard(q)

    async def publish(self, kind: str, data: Any) -> None:
        msg = {"kind": kind, "data": data}
        for ch in (kind, "*"):
            for q in list(self._subs.get(ch, set())):
                try:
                    q.put_nowait(msg)
                except asyncio.QueueFull:
                    pass


bus = EventBus()
