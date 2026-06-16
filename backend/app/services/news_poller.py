"""
Multi-source Kerala disaster news poller.

Sources (run every POLL_INTERVAL seconds):
  1. Manorama Online  – per-district HTML scraping
  2. Mathrubhumi Online – per-district HTML + RSS scraping
  3. IMD / Open-Meteo  – real-time rainfall alerts (Red/Orange/Yellow)

Each qualifying article / alert is stored as a NewsReport row (separate
from community Report rows).  Images are downloaded and stored as
image_url on the NewsReport itself (no separate table needed here).
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.district import District
from app.models.news_report import NewsReport
from app.services.imd_scraper import fetch_imd_alerts
from app.services.manorama_scraper import DISTRICT_MANORAMA_SLUG, fetch_district_news as fetch_manorama
from app.services.mathrubhumi_scraper import DISTRICT_MB_SLUG, fetch_district_news as fetch_mathrubhumi

POLL_INTERVAL = 600   # 10 minutes
STARTUP_DELAY = 15    # reduced — get first data faster

_ALL_SLUGS = set(DISTRICT_MANORAMA_SLUG.keys())

# ─── Disaster keyword filter ──────────────────────────────────────────────────
# Specific compound terms only — generic words are intentionally excluded
# to avoid false positives (crime/court/politics news).

_DISASTER_KEYWORDS = [
    # Heavy rain / flood — Malayalam
    "കനമഴ", "ശക്തമഴ", "അതിതീവ്ര മഴ", "അതിശക്തമായ",
    "പ്രളയ", "വെള്ളപ്പൊക്ക", "വെള്ളക്കെട്ട്", "കരകവിഞ്ഞ",
    "ജലനിരപ്പ്", "ഡാം ഷട്ടർ", "ഷട്ടർ തുറ", "ജലം തുറ",
    # Landslide — Malayalam
    "ഉരുൾ", "ഉരുൾപൊട്ടൽ", "മണ്ണിടിച്ചിൽ", "മലയിടിച്ചിൽ",
    # Disaster response — Malayalam
    "ദുരന്ത", "ദുരിതാശ്വാസ", "ദുരന്ത നിവാരണ", "ദുരിത ക്യാമ്പ്",
    "ഒഴിപ്പിച്ചു", "ഒഴിപ്പിക്ക", "രക്ഷാ പ്രവർത്തനം",
    # Weather alerts — Malayalam
    "ഇടിമിന്ന", "ഇടിവെട്ട", "ചുഴലി", "കൊടുങ്കാറ്റ്",
    "കടലേറ്റ", "കടൽക്ഷോഭ", "കാലവർഷ",
    "റെഡ് അലർട്ട്", "ഓറഞ്ച് അലർട്ട്", "യെലോ അലർട്ട്",
    "റെഡ് അലർട്ട", "ഓറഞ്ച് അലർട്ട", "ദുരന്ത മുന്നറിയിപ്പ്",
    # Infrastructure failure — Malayalam (compound only)
    "വൈദ്യുതി തടസ്സ", "കറന്റ് മുടങ്ങ",
    "കെട്ടിടം തകർ", "ഭിത്തി തകർ", "പാലം തകർ", "റോഡ് ഉരുൾ",
    # Flood / disaster — English
    "flood", "landslide", "cyclone", "cloudburst",
    "storm surge", "flash flood",
    "heavy rainfall", "heavy rain warning",
    "monsoon warning", "monsoon alert",
    "red alert", "orange alert", "yellow alert",
    # Emergency response — English
    "rescue operation", "relief camp", "evacuation",
    "disaster warning", "NDRF", "SDRF",
    # Infrastructure — English
    "power cut", "power outage", "building collapse", "bridge collapse",
    "dam shutter", "dam opened", "dam overflow",
    # Water events — English
    "drowning", "swept away", "submerged",
    "warning level", "danger level",
]

_COMPILED = [kw.lower() for kw in _DISASTER_KEYWORDS]


def _is_disaster(title: str) -> bool:
    low = title.lower()
    return any(kw in low for kw in _COMPILED)


def _is_for_district(url: str, slug: str) -> bool:
    """
    Return False if the URL path explicitly belongs to a DIFFERENT district.
    Kerala-wide paths (e.g. /news/kerala/) are allowed for all districts.
    """
    try:
        path = urlparse(url).path.lower()
    except Exception:
        return True
    for other in _ALL_SLUGS:
        if other == slug:
            continue
        if f"/{other}/" in path or path.endswith(f"/{other}"):
            return False
    return True


# ─── Image downloader ─────────────────────────────────────────────────────────

async def _verify_image_url(image_url: str) -> str | None:
    """
    Quick HEAD check to confirm the image URL is reachable and is actually an image.
    Returns the URL if valid, None otherwise.
    """
    if not image_url or not image_url.startswith("http"):
        return None
    try:
        async with httpx.AsyncClient(
            timeout=8.0,
            follow_redirects=True,
            headers={"User-Agent": "KeralaLive/1.0"},
        ) as client:
            resp = await client.head(image_url)
            ct = resp.headers.get("content-type", "")
            if resp.status_code < 400 and ct.startswith("image/"):
                return image_url
    except Exception:
        pass
    return None


# ─── Timestamp parser ─────────────────────────────────────────────────────────

def _parse_pub_date(raw: str) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    lower = raw.lower().strip()

    h_m = re.search(r"(\d+)\s*hour", lower)
    m_m = re.search(r"(\d+)\s*min",  lower)
    if h_m or m_m:
        h = int(h_m.group(1)) if h_m else 0
        m = int(m_m.group(1)) if m_m else 0
        return datetime.now(timezone.utc) - timedelta(hours=h, minutes=m)

    if "yesterday" in lower:
        return datetime.now(timezone.utc) - timedelta(days=1)

    # RFC 2822 (RSS pubDate) e.g. "Mon, 10 Jun 2024 12:30:00 +0530"
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(raw).astimezone(timezone.utc)
    except Exception:
        pass

    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw.strip(), fmt)
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        except ValueError:
            pass

    try:
        dt = datetime.fromisoformat(raw.strip())
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except Exception:
        pass

    return datetime.now(timezone.utc)


# ─── Store a single article / alert as a NewsReport ──────────────────────────

async def _store_article(
    db,
    district_id: int,
    title: str,
    url: str,
    image_url: str | None,
    published_at: str,
    source_name: str = "KeralaLive",
    severity: str | None = None,
) -> bool:
    """
    Store one article as a NewsReport.
    Returns True if stored (new), False if already exists (duplicate).
    """
    exists = db.execute(
        select(NewsReport).where(NewsReport.source_url == url)
    ).scalar_one_or_none()
    if exists:
        return False

    pub_dt = _parse_pub_date(published_at)
    verified_img = await _verify_image_url(image_url) if image_url else None

    db.add(NewsReport(
        district_id=district_id,
        title=title,
        source_url=url,
        image_url=verified_img,
        source_name=source_name,
        severity=severity,
        created_at=pub_dt,
    ))
    return True


# ─── Source pollers ───────────────────────────────────────────────────────────

async def _poll_manorama(db, slug_to_id: dict[str, int]) -> int:
    stored = 0
    for slug in DISTRICT_MANORAMA_SLUG:
        district_id = slug_to_id.get(slug)
        if not district_id:
            continue
        try:
            articles = await fetch_manorama(slug)
        except Exception as exc:
            print(f"[manorama] fetch error ({slug}): {exc}")
            continue

        for art in articles:
            url   = (art.get("url")   or "").strip()
            title = (art.get("title") or "").strip()
            if not url or not title or len(title) < 5:
                continue
            if not _is_disaster(title):
                continue
            if not _is_for_district(url, slug):
                print(f"[manorama] skip cross-district url ({slug}): {url[:80]}")
                continue
            ok = await _store_article(
                db, district_id, title, url,
                art.get("image_url"), art.get("published_at", ""),
                source_name="Manorama Online",
            )
            if ok:
                stored += 1

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[manorama] commit error ({slug}): {exc}")

    return stored


async def _poll_mathrubhumi(db, slug_to_id: dict[str, int]) -> int:
    stored = 0
    for slug in DISTRICT_MB_SLUG:
        district_id = slug_to_id.get(slug)
        if not district_id:
            continue
        try:
            articles = await fetch_mathrubhumi(slug)
        except Exception as exc:
            print(f"[mathrubhumi] fetch error ({slug}): {exc}")
            continue

        for art in articles:
            url   = (art.get("url")   or "").strip()
            title = (art.get("title") or "").strip()
            if not url or not title or len(title) < 5:
                continue
            if not _is_disaster(title):
                continue
            if not _is_for_district(url, slug):
                continue
            ok = await _store_article(
                db, district_id, title, url,
                art.get("image_url"), art.get("published_at", ""),
                source_name="Mathrubhumi Online",
            )
            if ok:
                stored += 1

        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            print(f"[mathrubhumi] commit error ({slug}): {exc}")

    return stored


async def _poll_imd(db, slug_to_id: dict[str, int]) -> int:
    stored = 0
    try:
        alerts = await fetch_imd_alerts()
    except Exception as exc:
        print(f"[imd] fetch error: {exc}")
        return 0

    for alert in alerts:
        slug        = alert.get("district_slug", "")
        district_id = slug_to_id.get(slug)
        if not district_id:
            continue

        level = alert.get("level") or alert["source_url"].split("/")[-1]  # red/orange/yellow
        ok = await _store_article(
            db,
            district_id,
            alert["title"],
            alert["source_url"],
            alert.get("image_url"),
            "",
            source_name="IMD Weather Alert",
            severity=level,
        )
        if ok:
            stored += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[imd] commit error: {exc}")

    return stored


# ─── Main poll cycle ──────────────────────────────────────────────────────────

async def _poll_once() -> None:
    db = SessionLocal()
    try:
        districts   = db.execute(select(District).where(District.is_active == True)).scalars().all()
        slug_to_id  = {d.slug: d.id for d in districts}

        mn = await _poll_manorama(db, slug_to_id)
        mb = await _poll_mathrubhumi(db, slug_to_id)
        im = await _poll_imd(db, slug_to_id)

        total = mn + mb + im
        if total:
            print(f"[poller] stored {total} reports  (manorama={mn} mathrubhumi={mb} imd={im})")
        else:
            print("[poller] poll complete — no new disaster reports found")

    finally:
        db.close()


# ─── Forever loop ─────────────────────────────────────────────────────────────

async def run_news_poller() -> None:
    await asyncio.sleep(STARTUP_DELAY)
    print("[poller] started — sources: Manorama • Mathrubhumi • IMD/Open-Meteo")

    while True:
        try:
            await _poll_once()
        except Exception as exc:
            print(f"[poller] unexpected error: {exc}")

        await asyncio.sleep(POLL_INTERVAL)
