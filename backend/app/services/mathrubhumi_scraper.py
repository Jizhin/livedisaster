"""
Scrapes district-level disaster news from Mathrubhumi Online.
Uses both RSS feeds and HTML district pages for maximum coverage.
"""

import re
import time
import xml.etree.ElementTree as ET
from typing import Optional

import httpx
from bs4 import BeautifulSoup

CACHE_TTL = 300  # 5 minutes

_cache: dict[str, tuple[float, list[dict]]] = {}

# Mathrubhumi district page slugs
DISTRICT_MB_SLUG: dict[str, str] = {
    "thiruvananthapuram": "thiruvananthapuram",
    "kollam":             "kollam",
    "pathanamthitta":     "pathanamthitta",
    "alappuzha":          "alappuzha",
    "kottayam":           "kottayam",
    "idukki":             "idukki",
    "ernakulam":          "ernakulam",
    "thrissur":           "thrissur",
    "palakkad":           "palakkad",
    "malappuram":         "malappuram",
    "kozhikode":          "kozhikode",
    "wayanad":            "wayanad",
    "kannur":             "kannur",
    "kasaragod":          "kasaragod",
}

# District name variants used in URLs / titles for cross-matching
_DISTRICT_VARIANTS: dict[str, list[str]] = {
    "thiruvananthapuram": ["thiruvananthapuram", "trivandrum", "തിരുവനന്തപുരം"],
    "kollam":             ["kollam", "quilon", "കൊല്ലം"],
    "pathanamthitta":     ["pathanamthitta", "പത്തനംതിട്ട"],
    "alappuzha":          ["alappuzha", "alleppey", "ആലപ്പുഴ"],
    "kottayam":           ["kottayam", "കോട്ടയം"],
    "idukki":             ["idukki", "ഇടുക്കി"],
    "ernakulam":          ["ernakulam", "kochi", "cochin", "എറണാകുളം"],
    "thrissur":           ["thrissur", "trichur", "തൃശ്ശൂർ"],
    "palakkad":           ["palakkad", "palghat", "പാലക്കാട്"],
    "malappuram":         ["malappuram", "മലപ്പുറം"],
    "kozhikode":          ["kozhikode", "calicut", "കോഴിക്കോട്"],
    "wayanad":            ["wayanad", "വയനാട്"],
    "kannur":             ["kannur", "cannanore", "കണ്ണൂർ"],
    "kasaragod":          ["kasaragod", "കാസർഗോഡ്"],
}

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ml,en-US;q=0.9,en;q=0.8",
}

# RSS feeds to try — in order of preference
_RSS_URLS = [
    "https://www.mathrubhumi.com/rss/home.xml",
    "https://www.mathrubhumi.com/cmlink/mathrubhumi-rss-1.290729",
]

_MB_NS = {
    "media":   "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
    "dc":      "http://purl.org/dc/elements/1.1/",
}


async def fetch_district_news(district_slug: str) -> list[dict]:
    """
    Return articles for a given district from Mathrubhumi.
    Tries HTML district page first, falls back to filtering RSS feed.
    """
    cache_key = f"mb_{district_slug}"
    if cache_key in _cache:
        cached_at, articles = _cache[cache_key]
        if time.time() - cached_at < CACHE_TTL:
            return articles

    articles: list[dict] = []

    async with httpx.AsyncClient(
        timeout=15.0,
        follow_redirects=True,
        headers=_BROWSER_HEADERS,
    ) as client:
        # 1. Try district-specific HTML page
        articles = await _fetch_html_page(client, district_slug)

        # 2. Fall back to RSS if HTML gave nothing
        if not articles:
            articles = await _fetch_rss_for_district(client, district_slug)

    _cache[cache_key] = (time.time(), articles)
    return articles


async def _fetch_html_page(client: httpx.AsyncClient, slug: str) -> list[dict]:
    """Try Mathrubhumi district HTML page."""
    urls = [
        f"https://www.mathrubhumi.com/news/kerala/{slug}",
        f"https://www.mathrubhumi.com/{slug}",
    ]
    for url in urls:
        try:
            resp = await client.get(url)
            if resp.status_code == 200:
                return _parse_html(resp.text, slug)
        except Exception:
            continue
    return []


async def _fetch_rss_for_district(client: httpx.AsyncClient, slug: str) -> list[dict]:
    """Fetch RSS feed and filter articles relevant to this district."""
    all_articles: list[dict] = []
    for rss_url in _RSS_URLS:
        try:
            resp = await client.get(rss_url, headers={"User-Agent": "KeralaLive/1.0"})
            if resp.status_code == 200:
                all_articles.extend(_parse_rss(resp.text))
                break
        except Exception:
            continue

    variants = _DISTRICT_VARIANTS.get(slug, [slug])
    relevant = []
    for art in all_articles:
        combined = (art["url"] + " " + art["title"]).lower()
        if any(v.lower() in combined for v in variants):
            relevant.append(art)

    return relevant[:12]


def _parse_rss(xml_text: str) -> list[dict]:
    """Parse Mathrubhumi RSS XML into article dicts."""
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except ET.ParseError:
        return []

    channel = root.find("channel") or root
    articles: list[dict] = []

    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link  = (item.findtext("link")  or "").strip()
        pub   = (
            item.findtext("pubDate")
            or item.findtext("dc:date", namespaces=_MB_NS)
            or ""
        ).strip()

        if not title or not link or len(title) < 10:
            continue

        image_url = _rss_image(item)

        articles.append({
            "title":        title,
            "url":          link,
            "image_url":    image_url,
            "published_at": pub,
            "sub_district": None,
            "summary":      (item.findtext("description") or "")[:300].strip(),
        })

    return articles


def _rss_image(item) -> Optional[str]:
    """Extract image URL from RSS item using multiple strategies."""
    # media:content
    el = item.find("media:content", _MB_NS)
    if el is not None and el.get("url"):
        return el.get("url")

    # media:thumbnail
    el = item.find("media:thumbnail", _MB_NS)
    if el is not None and el.get("url"):
        return el.get("url")

    # enclosure
    el = item.find("enclosure")
    if el is not None and "image" in (el.get("type") or ""):
        return el.get("url")

    # img tag inside description HTML
    desc = item.findtext("description") or ""
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc)
    if m:
        src = m.group(1)
        if not src.startswith("data:") and "placeholder" not in src:
            return src

    return None


def _parse_html(html: str, district_slug: str) -> list[dict]:
    """Parse Mathrubhumi district HTML page for articles."""
    soup = BeautifulSoup(html, "lxml")
    articles: list[dict] = []

    selectors = [
        "article.story-card",
        "li.story-card",
        ".story-card",
        "article[class*='story']",
        "li[class*='story']",
        ".article-list-item",
        "article",
    ]

    items = []
    for sel in selectors:
        found = soup.select(sel)
        if len(found) >= 3:
            items = found
            break

    for item in items[:20]:
        # Link
        a_tag = item.find("a", href=True)
        if not a_tag:
            continue
        href = a_tag["href"]
        if not href.startswith("http"):
            href = "https://www.mathrubhumi.com" + href

        # Title
        title_el = (
            item.find(["h2", "h3", "h4"], class_=re.compile(r"head|title", re.I))
            or item.find(["h2", "h3", "h4"])
        )
        title = title_el.get_text(strip=True) if title_el else a_tag.get_text(strip=True)
        if not title or len(title) < 8:
            continue

        # Image
        img_el = item.find("img")
        image_url = None
        if img_el:
            for attr in ("data-src", "src", "data-lazy-src", "data-original"):
                val = img_el.get(attr)
                if val and not val.startswith("data:") and "placeholder" not in val:
                    image_url = val
                    break

        # Time
        time_el = item.find(["time", "span"], class_=re.compile(r"date|time|ago", re.I))
        published = time_el.get_text(strip=True) if time_el else ""

        articles.append({
            "title":        title,
            "url":          href,
            "image_url":    image_url,
            "published_at": published,
            "sub_district": None,
            "summary":      "",
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
