"""
Scrapes district-level news from Manorama Online.
Results are cached in memory for 5 minutes to avoid rate-limiting.
"""

import json
import re
import time
from dataclasses import dataclass
from typing import Optional

import httpx
from bs4 import BeautifulSoup

CACHE_TTL = 300  # seconds

_cache: dict[str, tuple[float, list[dict]]] = {}

DISTRICT_MANORAMA_SLUG: dict[str, str] = {
    "thiruvananthapuram": "thiruvananthapuram",
    "kollam": "kollam",
    "pathanamthitta": "pathanamthitta",
    "alappuzha": "alappuzha",
    "kottayam": "kottayam",
    "idukki": "idukki",
    "ernakulam": "ernakulam",
    "thrissur": "thrissur",
    "palakkad": "palakkad",
    "malappuram": "malappuram",
    "kozhikode": "kozhikode",
    "wayanad": "wayanad",
    "kannur": "kannur",
    "kasaragod": "kasaragod",
}

DISTRICT_SUB_AREAS: dict[str, list[str]] = {
    "kannur": ["Kannur City", "Thalassery", "Iritty", "Payyannur", "Mattannur", "Koothuparamba"],
    "thiruvananthapuram": ["Thiruvananthapuram City", "Neyyattinkara", "Attingal", "Nedumangad", "Varkala"],
    "kollam": ["Kollam City", "Karunagappally", "Punalur", "Kottarakkara", "Pathanapuram"],
    "pathanamthitta": ["Pathanamthitta", "Adoor", "Thiruvalla", "Ranni", "Kozhencherry"],
    "alappuzha": ["Alappuzha City", "Cherthala", "Chengannur", "Mavelikkara", "Kayamkulam"],
    "kottayam": ["Kottayam City", "Pala", "Vaikom", "Changanassery", "Erattupetta"],
    "idukki": ["Idukki", "Munnar", "Thodupuzha", "Kumily", "Nedumkandam"],
    "ernakulam": ["Kochi City", "Aluva", "Muvattupuzha", "Kothamangalam", "Angamaly"],
    "thrissur": ["Thrissur City", "Chalakudy", "Guruvayur", "Irinjalakuda", "Kunnamkulam"],
    "palakkad": ["Palakkad City", "Ottapalam", "Mannarkkad", "Alathur", "Shornur"],
    "malappuram": ["Malappuram City", "Tirur", "Manjeri", "Perinthalmanna", "Ponnani"],
    "kozhikode": ["Kozhikode City", "Vatakara", "Koyilandy", "Ramanattukara", "Kondotty"],
    "wayanad": ["Kalpetta", "Mananthavady", "Sulthan Bathery", "Vythiri", "Ambalavayal"],
    "kasaragod": ["Kasaragod", "Kanhangad", "Hosdurg", "Manjeshwar", "Nileshwar"],
}

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ml,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


async def fetch_district_news(district_slug: str) -> list[dict]:
    if district_slug in _cache:
        cached_at, articles = _cache[district_slug]
        if time.time() - cached_at < CACHE_TTL:
            return articles

    manorama_slug = DISTRICT_MANORAMA_SLUG.get(district_slug)
    if not manorama_slug:
        return []

    url = f"https://www.manoramaonline.com/district-news/{manorama_slug}.html"

    try:
        async with httpx.AsyncClient(
            timeout=12.0,
            follow_redirects=True,
            headers=_BROWSER_HEADERS,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        articles = _parse(resp.text, district_slug)
        _cache[district_slug] = (time.time(), articles)
        return articles

    except Exception as exc:
        print(f"[manorama] scrape error ({district_slug}): {exc}")
        # Return stale cache if available
        if district_slug in _cache:
            return _cache[district_slug][1]
        return []


def _abs(href: str) -> str:
    if href.startswith("http"):
        return href
    return "https://www.manoramaonline.com" + href


def _first_img(el) -> Optional[str]:
    for attr in ("data-src", "src", "data-lazy-src", "data-original"):
        tag = el.find("img")
        if tag and tag.get(attr):
            src = tag[attr]
            if src.startswith("data:") or "placeholder" in src or "blank" in src:
                continue
            return src
    return None


def _parse(html: str, district_slug: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    articles: list[dict] = []

    # ── 1. Try JSON-LD structured data (most reliable) ──────────────
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = []
            if isinstance(data, list):
                items = data
            elif data.get("@type") == "ItemList":
                items = data.get("itemListElement", [])
            elif data.get("@type") in ("NewsArticle", "Article"):
                items = [data]

            for item in items:
                thing = item.get("item", item)
                title = thing.get("headline") or thing.get("name", "")
                url = thing.get("url", "")
                image_obj = thing.get("image", {})
                image_url = (
                    image_obj.get("url") if isinstance(image_obj, dict) else image_obj
                ) if image_obj else None
                published = thing.get("datePublished", "")
                if title and url:
                    articles.append({
                        "title": title,
                        "url": _abs(url),
                        "image_url": image_url,
                        "published_at": published,
                        "sub_district": None,
                        "summary": thing.get("description", ""),
                    })
        except Exception:
            pass

    if articles:
        return _dedupe(articles[:16])

    # ── 2. HTML selectors – try from most to least specific ─────────
    selectors = [
        "li.story-card",
        "article.story-card",
        ".story-card",
        "li[class*='story']",
        "article[class*='story']",
        "li[class*='news']",
        ".news-card",
        ".article-card",
        "li.item",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if len(found) >= 3:
            items = found
            break

    # ── 3. Fallback: all internal news links ────────────────────────
    if not items:
        seen: set[str] = set()
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/news/" in href or "/district-news/" in href:
                href = _abs(href)
                if href not in seen:
                    seen.add(href)
                    text = a.get_text(strip=True)
                    if len(text) > 20:
                        articles.append({
                            "title": text,
                            "url": href,
                            "image_url": None,
                            "published_at": "",
                            "sub_district": None,
                            "summary": "",
                        })
        return _dedupe(articles[:16])

    for i, item in enumerate(items[:20]):
        # Title
        title_el = item.find(
            ["h2", "h3", "h4", "strong"],
            class_=re.compile(r"headline|title|head", re.I),
        ) or item.find(["h2", "h3", "h4"])
        title = title_el.get_text(strip=True) if title_el else ""

        # Link
        link_el = item.find("a", href=True) or (item if item.name == "a" else None)
        url = _abs(link_el["href"]) if link_el and link_el.get("href") else ""

        if not title and link_el:
            title = link_el.get_text(strip=True)

        if not title or len(title) < 8:
            continue

        # Image
        image_url = _first_img(item)

        # Time
        time_el = item.find(
            ["time", "span", "div"],
            class_=re.compile(r"date|time|pubdate|ago", re.I),
        ) or item.find("time")
        published = time_el.get_text(strip=True) if time_el else ""

        # Sub-district tag
        tag_el = item.find(
            ["span", "div", "a"],
            class_=re.compile(r"tag|label|district|category|location", re.I),
        )
        sub = tag_el.get_text(strip=True).upper() if tag_el else None

        # Summary
        summary_el = item.find(
            ["p", "div"],
            class_=re.compile(r"summary|desc|intro|lead|teaser", re.I),
        )
        summary = summary_el.get_text(strip=True) if summary_el else ""

        articles.append({
            "title": title,
            "url": url,
            "image_url": image_url,
            "published_at": published,
            "sub_district": sub,
            "summary": summary,
        })

    return _dedupe(articles[:16])


def _dedupe(articles: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for a in articles:
        key = a["url"] or a["title"]
        if key not in seen:
            seen.add(key)
            out.append(a)
    return out


def get_sub_areas(district_slug: str) -> list[str]:
    return DISTRICT_SUB_AREAS.get(district_slug, [])
