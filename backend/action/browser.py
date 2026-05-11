"""Chrome via Playwright. Supports CDP attach to an existing Chrome instance,
or launching a managed Chromium (default).
"""
from __future__ import annotations
from typing import Optional

import httpx
from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from ..core.config import settings
from ..core.logging import get
from ..core.safety import gate, Action, Tier

log = get("omni.browser")


async def cdp_alive(endpoint: str, timeout: float = 1.5) -> bool:
    """Returns True if Chrome is exposing CDP at this endpoint."""
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.get(endpoint.rstrip("/") + "/json/version")
            return r.status_code == 200
    except Exception:
        return False


def _find_chrome_exe() -> Optional[str]:
    """Locate the user's installed Chrome on Windows."""
    import os
    from pathlib import Path
    candidates = [
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


class Chrome:
    """Wraps a single browser context.

    Attach precedence:
      1. settings.browser.cdp_endpoint, if alive
      2. http://127.0.0.1:9222, if alive (common Chrome --remote-debugging-port)
      3. fall through to managed Playwright Chromium (settings.browser.launch_managed)
    """

    def __init__(self) -> None:
        self._pw = None
        self._browser: Optional[Browser] = None
        self.ctx: Optional[BrowserContext] = None
        self.mode: str = "detached"     # detached | cdp | profile | managed

    async def attach_or_launch(self) -> str:
        """Idempotent. Returns the mode used.

        Order:
          1. CDP attach (the user already ran launch-chrome.ps1 -> their
             logged-in profile is reused, bookmarks/passwords/extensions all
             intact). New navigation opens a *tab* in the existing context, not
             a new window.
          2. Try to launch Chrome ourselves with the OMNI dedicated profile and
             CDP port, then attach. The profile persists between runs so logins
             are kept.
          3. Fall back to ephemeral managed Chromium (last resort, no logins).
        """
        if self.ctx is not None:
            return self.mode

        self._pw = await async_playwright().start()

        endpoints: list[str] = []
        if settings.browser.cdp_endpoint:
            endpoints.append(settings.browser.cdp_endpoint)
        endpoints.append("http://127.0.0.1:9222")

        for ep in endpoints:
            if await cdp_alive(ep):
                log.info("attaching CDP %s", ep)
                self._browser = await self._pw.chromium.connect_over_cdp(ep)
                self.ctx = (
                    self._browser.contexts[0]
                    if self._browser.contexts
                    else await self._browser.new_context()
                )
                self.mode = "cdp"
                if settings.browser.open_new_tab_on_attach:
                    try:
                        page = await self.ctx.new_page()
                        await page.goto("about:blank")
                    except Exception as e:
                        log.warning("new tab on attach failed: %s", e)
                return self.mode

        # 2. Launch Chrome ourselves with the dedicated OMNI profile.
        if settings.browser.launch_managed:
            launched = await self._launch_chrome_with_profile()
            if launched:
                return self.mode

        await self._pw.stop()
        self._pw = None
        raise RuntimeError(
            "Chrome not reachable on CDP. Run launch-chrome.ps1 (recommended) "
            "or enable browser.launch_managed."
        )

    async def _launch_chrome_with_profile(self) -> bool:
        """Launch the user's Chrome with a persistent OMNI profile + CDP, then attach."""
        import os
        from pathlib import Path
        chrome_exe = _find_chrome_exe()
        if not chrome_exe:
            log.warning("Chrome executable not found - falling back to managed Chromium")
            return await self._launch_managed_chromium()
        profile_dir = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "OMNI" / "chrome-profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        try:
            # Persistent context = your profile (cookies, bookmarks, passwords) is kept
            # across runs, and Chrome is launched as a normal-looking user session.
            self.ctx = await self._pw.chromium.launch_persistent_context(
                user_data_dir=str(profile_dir),
                executable_path=chrome_exe,
                headless=False,
                accept_downloads=True,
                args=[
                    "--remote-debugging-port=9222",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-blink-features=AutomationControlled",
                ],
                ignore_default_args=["--enable-automation"],
            )
            self._browser = None  # persistent_context owns its browser
            self.mode = "profile"
            log.info("launched Chrome with OMNI profile: %s", profile_dir)
            return True
        except Exception as e:
            log.warning("profile-launch failed (%s); falling back to managed Chromium", e)
            return await self._launch_managed_chromium()

    async def _launch_managed_chromium(self) -> bool:
        log.info("launching ephemeral managed Chromium (no persistent profile)")
        self._browser = await self._pw.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.ctx = await self._browser.new_context(accept_downloads=True)
        self.mode = "managed"
        return True

    async def close(self) -> None:
        try:
            if self._browser:
                await self._browser.close()
            elif self.ctx is not None:
                # Persistent context owns its browser; close the context to shut it down.
                await self.ctx.close()
        finally:
            if self._pw:
                await self._pw.stop()
            self._browser = None
            self._pw = None
            self.ctx = None
            self.mode = "detached"

    async def goto(self, url: str, in_new_tab: bool = True) -> Page:
        """Open a URL.

        Defaults to opening a NEW TAB inside the existing context (so the
        user's logged-in profile is reused and the existing window stays put).
        """
        await gate.gate(Action("browser.navigate", Tier.ACT, {"url": url}))
        if not self.ctx:
            await self.attach_or_launch()
        assert self.ctx is not None
        if in_new_tab or not self.ctx.pages:
            page = await self.ctx.new_page()
        else:
            # Reuse the most recently active blank tab if there is one.
            page = next(
                (p for p in self.ctx.pages if (p.url or "").startswith("about:")),
                self.ctx.pages[-1],
            )
        await page.goto(url, wait_until="domcontentloaded")
        try:
            await page.bring_to_front()
        except Exception:
            pass
        return page

    async def list_tabs(self) -> list[dict]:
        if not self.ctx:
            return []
        out = []
        for p in self.ctx.pages:
            try:
                out.append({"url": p.url, "title": await p.title()})
            except Exception:
                pass
        return out

    async def find_tab(self, url_substring: str) -> Optional[Page]:
        if not self.ctx:
            return None
        for p in self.ctx.pages:
            if url_substring.lower() in (p.url or "").lower():
                return p
        return None

    async def chatgpt_tabs(self) -> list[Page]:
        if not self.ctx:
            return []
        return [
            p for p in self.ctx.pages
            if "chatgpt.com" in (p.url or "") or "chat.openai.com" in (p.url or "")
        ]


chrome = Chrome()
