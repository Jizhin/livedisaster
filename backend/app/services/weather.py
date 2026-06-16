"""
Fetch real-time rainfall forecasts from Open-Meteo (free, no API key)
and convert to IMD-style Kerala alert levels.

IMD daily rainfall thresholds:
  Yellow : 64.5 – 115.5 mm   (heavy rain)
  Orange : 115.6 – 204.4 mm  (very heavy rain)
  Red    : ≥ 204.5 mm        (extremely heavy rain)
"""

import json
import urllib.request
from datetime import datetime

# District headquarters lat/lon (WGS-84)
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
    "&daily=precipitation_sum,weathercode"
    "&timezone=Asia%2FKolkata"
    "&forecast_days=1"
)


def fetch_weather_alert(district_slug: str) -> dict | None:
    """
    Return an alert dict if rainfall thresholds are exceeded, else None.
    Makes a single synchronous HTTP call to Open-Meteo.
    """
    coords = DISTRICT_COORDS.get(district_slug)
    if not coords:
        return None
    lat, lon = coords
    url = _OPEN_METEO.format(lat=lat, lon=lon)

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KeralaLive/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read())
    except Exception:
        return None

    precip_list = data.get("daily", {}).get("precipitation_sum", [])
    precip_mm: float = precip_list[0] if precip_list and precip_list[0] is not None else 0.0

    now_label = datetime.utcnow().strftime("%d %b %Y")

    if precip_mm >= 204.5:
        return {
            "title": "Red Alert",
            "severity": "red",
            "content": (
                f"Extremely heavy rainfall warning — {precip_mm:.0f} mm forecast today ({now_label}). "
                "Avoid river banks, low-lying areas and travel. Source: Open-Meteo / IMD thresholds."
            ),
            "source": "IMD / Open-Meteo Forecast",
        }
    if precip_mm >= 115.6:
        return {
            "title": "Orange Alert",
            "severity": "orange",
            "content": (
                f"Very heavy rainfall warning — {precip_mm:.0f} mm forecast today ({now_label}). "
                "Stay alert and avoid unnecessary outdoor activity. Source: Open-Meteo / IMD thresholds."
            ),
            "source": "IMD / Open-Meteo Forecast",
        }
    if precip_mm >= 64.5:
        return {
            "title": "Yellow Alert",
            "severity": "yellow",
            "content": (
                f"Heavy rainfall expected — {precip_mm:.0f} mm forecast today ({now_label}). "
                "Exercise caution near water bodies. Source: Open-Meteo / IMD thresholds."
            ),
            "source": "IMD / Open-Meteo Forecast",
        }
    return None
