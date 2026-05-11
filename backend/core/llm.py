"""Local LLM and VLM interface — Ollama only."""
from __future__ import annotations
import base64
from io import BytesIO
from pathlib import Path
from typing import Iterable, Optional

import httpx
from PIL import Image

from .config import settings
from .logging import get

log = get("omni.llm")


class Ollama:
    def __init__(self, host: Optional[str] = None) -> None:
        self.host = (host or settings.ollama_host).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self.host, timeout=httpx.Timeout(300.0))

    async def health(self) -> bool:
        try:
            r = await self._client.get("/api/tags")
            return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        r = await self._client.get("/api/tags")
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]

    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        system: Optional[str] = None,
        images: Optional[list[Image.Image | bytes | str | Path]] = None,
        temperature: float = 0.2,
        num_predict: int = 1024,
    ) -> str:
        model = model or settings.profile.text_reason
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": num_predict},
        }
        if system:
            payload["system"] = system
        if images:
            payload["images"] = [_b64(img) for img in images]
        r = await self._client.post("/api/generate", json=payload)
        r.raise_for_status()
        return r.json().get("response", "")

    async def chat(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.2,
        images: Optional[list] = None,
    ) -> str:
        # Use vision model when screen images are provided
        model = model or (settings.profile.vision if images else settings.profile.text_reason)
        msgs = list(messages)
        if images:
            # Attach images to the last user message
            for i in range(len(msgs) - 1, -1, -1):
                if msgs[i].get("role") == "user":
                    msgs[i] = {**msgs[i], "images": [_b64(img) for img in images]}
                    break
        r = await self._client.post(
            "/api/chat",
            json={"model": model, "messages": msgs, "stream": False,
                  "options": {"temperature": temperature}},
        )
        r.raise_for_status()
        return r.json().get("message", {}).get("content", "")

    async def embed(self, text: str | Iterable[str], model: Optional[str] = None) -> list[list[float]]:
        model = model or settings.profile.embed
        inputs = [text] if isinstance(text, str) else list(text)
        r = await self._client.post("/api/embed", json={"model": model, "input": inputs})
        r.raise_for_status()
        return r.json().get("embeddings", [])


def _b64(img) -> str:
    if isinstance(img, (str, Path)):
        return base64.b64encode(Path(img).read_bytes()).decode()
    if isinstance(img, bytes):
        return base64.b64encode(img).decode()
    if isinstance(img, Image.Image):
        buf = BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    raise TypeError(f"Unsupported image type: {type(img)}")


llm = Ollama()
