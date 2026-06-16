"""
Fetches real-time district-level rainfall data from Open-Meteo (free, no API key)
and generates IMD-equivalent Red / Orange / Yellow alerts.

IMD daily rainfall thresholds (24-hour accumulation):
  Yellow : 64.5 – 115.5 mm   (heavy rain)
  Orange : 115.6 – 204.4 mm  (very heavy rain)
  Red    : ≥ 204.5 mm        (extremely heavy rain)

Open-Meteo WMO weather codes that indicate severe convective activity:
  95  – Thunderstorm
  96  – Thunderstorm with slight hail
  99  – Thunderstorm with heavy hail
"""

import asyncio
from datetime import date, datetime

import httpx

DISTRICT_COORDS: dict[str, tuple[float, float]] = {
    "thiruvananthapuram": (8.5241,  76.9366),
    "kollam":             (8.8932,  76.6141),
    "pathanamthitta":     (9.2648,  76.7870),
    "alappuzha":          (9.4981,  76.3388),
    "kottayam":           (9.5916,  76.5222),
    "idukki":             (9.9189,  76.9705),
    "ernakulam":          (9.9312,  76.2673),
    "thrissur":           (10.5276, 76.2144),
    "palakkad":           (10.7867, 76.6548),
    "malappuram":         (11.0510, 76.0711),
    "kozhikode":          (11.2588, 75.7804),
    "wayanad":            (11.6854, 76.1320),
    "kannur":             (11.8745, 75.3704),
    "kasaragod":          (12.4996, 74.9869),
}

_OPEN_METEO = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude={lat}&longitude={lon}"
    "&daily=precipitation_sum,weathercode,precipitation_probability_max"
    "&timezone=Asia%2FKolkata"
    "&forecast_days=1"
)

_STORM_CODES = {95, 96, 99}


async def fetch_imd_alerts() -> list[dict]:
    """
    Returns one alert dict per district that exceeds IMD rainfall thresholds.
    Each dict has: district_slug, title, content, source_url
    """
    today = date.today().isoformat()
    async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": "KeralaLive/1.0"}) as client:
        tasks = [
            _check_district(client, slug, lat, lon, today)
            for slug, (lat, lon) in DISTRICT_COORDS.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    return [r for r in results if isinstance(r, dict)]


async def _check_district(
    client: httpx.AsyncClient,
    slug: str,
    lat: float,
    lon: float,
    today: str,
) -> dict | None:
    url = _OPEN_METEO.format(lat=lat, lon=lon)
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        print(f"[imd] fetch error ({slug}): {exc}")
        return None

    daily     = data.get("daily", {})
    precip_mm: float = _first(daily.get("precipitation_sum")) or 0.0
    wcode: int       = int(_first(daily.get("weathercode")) or 0)
    prob: int        = int(_first(daily.get("precipitation_probability_max")) or 0)

    has_storm   = wcode in _STORM_CODES
    date_label  = datetime.now().strftime("%d %b %Y")
    dname       = slug.replace("-", " ").title()

    if precip_mm >= 204.5 or (has_storm and precip_mm >= 115):
        level   = "red"
        headline = f"Red Alert – {dname}: Extremely Heavy Rainfall Warning"
        body    = (
            f"{precip_mm:.0f} mm rainfall forecast for {dname} on {date_label}. "
            "Extremely heavy rain expected. Evacuate low-lying and riverside areas immediately. "
            "All outdoor activities suspended. NDRF/SDRF on standby. "
            "Source: Open-Meteo forecast • IMD thresholds."
        )
    elif precip_mm >= 115.6 or (has_storm and precip_mm >= 64):
        level   = "orange"
        headline = f"Orange Alert – {dname}: Very Heavy Rainfall Warning"
        body    = (
            f"{precip_mm:.0f} mm rainfall forecast for {dname} on {date_label}. "
            "Very heavy rain expected. Avoid river banks and coastal areas. "
            "Fishermen advised not to venture into sea. Stay alert. "
            "Source: Open-Meteo forecast • IMD thresholds."
        )
    elif precip_mm >= 64.5:
        level   = "yellow"
        headline = f"Yellow Alert – {dname}: Heavy Rainfall Warning"
        body    = (
            f"{precip_mm:.0f} mm rainfall forecast for {dname} on {date_label}. "
            "Heavy rain expected. Exercise caution near water bodies and hilly areas. "
            "Source: Open-Meteo forecast • IMD thresholds."
        )
    else:
        return None

    return {
        "district_slug": slug,
        "title":         headline,
        "content":       body,
        "image_url":     None,
        # Unique per district + day + level — prevents duplicate entries
        "source_url":    f"imd://{slug}/{today}/{level}",
    }


def _first(lst):
    if lst and lst[0] is not None:
        return lst[0]
    return None
