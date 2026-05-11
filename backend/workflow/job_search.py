"""Job search adapters. Each site has its own thin scraper that yields candidate jobs.

These adapters favour stable DOM selectors when possible but should always be
backed by VLM fallback (perception.screen.propose_action) when selectors break.
"""
from __future__ import annotations
from dataclasses import dataclass
from urllib.parse import quote_plus

from ..action.browser import chrome
from ..core.config import settings
from ..core.logging import get

log = get("omni.search")


@dataclass
class JobLead:
    url: str
    title: str
    company: str
    location: str
    source: str
    posted: str = ""


# LinkedIn
async def linkedin(query: str, location: str, *, avoid_easy_apply: bool = True,
                   max_results: int = 25) -> list[JobLead]:
    # Plain search; we filter Easy Apply client-side from card markers below
    # because LinkedIn's "exclude" filter for Easy Apply is not reliably URL-driven.
    url = (
        f"https://www.linkedin.com/jobs/search/?"
        f"keywords={quote_plus(query)}&location={quote_plus(location)}"
    )
    page = await chrome.goto(url)
    await page.wait_for_timeout(2000)
    leads: list[JobLead] = []
    cards = await page.query_selector_all(
        "div.job-card-container, li.jobs-search-results__list-item"
    )
    for card in cards[:max_results]:
        try:
            t = await card.query_selector(
                "a.job-card-list__title, a.job-card-container__link"
            )
            if not t:
                continue
            href = await t.get_attribute("href")
            title = (await t.inner_text()).strip()
            comp = await card.query_selector(
                "span.job-card-container__primary-description, h4"
            )
            company = (await comp.inner_text()).strip() if comp else ""
            loc = await card.query_selector("li.job-card-container__metadata-item")
            loc_t = (await loc.inner_text()).strip() if loc else location
            if avoid_easy_apply:
                ea = await card.query_selector(
                    "span:has-text('Easy Apply'), li:has-text('Easy Apply')"
                )
                if ea:
                    continue
            if href:
                full = href if href.startswith("http") else "https://www.linkedin.com" + href
                leads.append(JobLead(full, title, company, loc_t, "linkedin"))
        except Exception as e:
            log.debug("linkedin card parse: %s", e)
    return leads


# Glassdoor
async def glassdoor(query: str, location: str, *, max_results: int = 25) -> list[JobLead]:
    url = (
        f"https://www.glassdoor.com/Job/jobs.htm?"
        f"sc.keyword={quote_plus(query)}&locKeyword={quote_plus(location)}"
    )
    page = await chrome.goto(url)
    await page.wait_for_timeout(2500)
    leads: list[JobLead] = []
    cards = await page.query_selector_all("li[data-test='jobListing']")
    for card in cards[:max_results]:
        try:
            a = await card.query_selector("a[data-test='job-title']")
            if not a:
                continue
            href = await a.get_attribute("href")
            title = (await a.inner_text()).strip()
            comp = await card.query_selector("[data-test='employer-name']")
            loc = await card.query_selector("[data-test='emp-location']")
            if href:
                leads.append(JobLead(
                    href if href.startswith("http") else "https://www.glassdoor.com" + href,
                    title,
                    (await comp.inner_text()).strip() if comp else "",
                    (await loc.inner_text()).strip() if loc else location,
                    "glassdoor",
                ))
        except Exception as e:
            log.debug("glassdoor card parse: %s", e)
    return leads


async def extract_jd(page_or_url) -> dict:
    if isinstance(page_or_url, str):
        page = await chrome.goto(page_or_url)
    else:
        page = page_or_url
    await page.wait_for_timeout(1500)
    title = await page.title()
    selectors = [
        "div.show-more-less-html__markup",
        "div.jobs-description__container",
        "div[data-test='jobDescriptionText']",
        "div#jobDescriptionText",
        "section.job-description",
        "main",
    ]
    body = ""
    for sel in selectors:
        el = await page.query_selector(sel)
        if el:
            body = (await el.inner_text()).strip()
            if len(body) > 200:
                break
    return {"url": page.url, "title": title, "jd_text": body}


async def search_all(query: str, location: str, *, sources: list[str] | None = None,
                     avoid_easy_apply: bool | None = None) -> list[JobLead]:
    avoid = avoid_easy_apply if avoid_easy_apply is not None else settings.prefs.avoid_easy_apply
    sources = sources or ["linkedin", "glassdoor"]
    out: list[JobLead] = []
    for s in sources:
        try:
            if s == "linkedin":
                out.extend(await linkedin(query, location, avoid_easy_apply=avoid))
            elif s == "glassdoor":
                out.extend(await glassdoor(query, location))
        except Exception as e:
            log.warning("source %s failed: %s", s, e)
    seen, uniq = set(), []
    for j in out:
        if j.url not in seen:
            seen.add(j.url)
            uniq.append(j)
    return uniq
