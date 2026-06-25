import math
import re
from typing import Any

import httpx
from fastapi import APIRouter
from app.api.deps import DbSession
from app.core.errors import AppError
from app.crud import alerts as alert_crud
from app.crud import districts as district_crud
from app.models.alert import OfficialAlert
from app.schemas.alert import AlertRead
from app.services.weather import fetch_weather_alert

_DISTRICT_CANONICAL: dict[str, str] = {
    "thiruvananthapuram": "Trivandrum", "trivandrum": "Trivandrum",
    "kollam": "Kollam", "pathanamthitta": "Pathanamthitta",
    "alappuzha": "Alappuzha", "alleppey": "Alappuzha",
    "kottayam": "Kottayam", "idukki": "Idukki",
    "ernakulam": "Ernakulam", "kochi": "Ernakulam", "cochin": "Ernakulam",
    "thrissur": "Thrissur", "trichur": "Thrissur",
    "palakkad": "Palakkad", "palghat": "Palakkad",
    "malappuram": "Malappuram",
    "kozhikode": "Kozhikode", "calicut": "Kozhikode",
    "wayanad": "Wayanad",
    "kannur": "Kannur", "cannanore": "Kannur",
    "kasaragod": "Kasaragod",
}

_DISTRICT_COORDS = [
    {"name": "Trivandrum", "lat": 8.5241, "lon": 76.9366},
    {"name": "Kollam", "lat": 8.8932, "lon": 76.6141},
    {"name": "Pathanamthitta", "lat": 9.2648, "lon": 76.787},
    {"name": "Alappuzha", "lat": 9.4981, "lon": 76.3388},
    {"name": "Kottayam", "lat": 9.5916, "lon": 76.5222},
    {"name": "Idukki", "lat": 9.85, "lon": 76.97},
    {"name": "Ernakulam", "lat": 9.9816, "lon": 76.2999},
    {"name": "Thrissur", "lat": 10.5276, "lon": 76.2144},
    {"name": "Palakkad", "lat": 10.7867, "lon": 76.6548},
    {"name": "Malappuram", "lat": 11.041, "lon": 76.0788},
    {"name": "Kozhikode", "lat": 11.2588, "lon": 75.7804},
    {"name": "Wayanad", "lat": 11.6854, "lon": 76.132},
    {"name": "Kannur", "lat": 11.8745, "lon": 75.3704},
    {"name": "Kasaragod", "lat": 12.4996, "lon": 74.9869},
]


def _map_severity(color: str, label: str) -> tuple[str, str]:
    c = (color or "").lower()
    lbl = label or "Advisory"
    if c == "red":
        return "critical", lbl
    if c in ("orange", "yellow"):
        return "warn", lbl
    return "safe", lbl


def _in_kerala(centroid: str | None) -> tuple[bool, float | None, float | None]:
    if not centroid:
        return False, None, None
    parts = centroid.split(",")
    if len(parts) != 2:
        return False, None, None
    try:
        lon, lat = float(parts[0]), float(parts[1])
        inside = 8 <= lat <= 13 and 74.5 <= lon <= 77.6
        return inside, lat, lon
    except ValueError:
        return False, None, None


def _detect_district(text: str) -> str | None:
    t = text.lower()
    for key, val in _DISTRICT_CANONICAL.items():
        if key in t:
            return val
    return None


def _nearest_district(lat: float, lon: float) -> str:
    best_name = _DISTRICT_COORDS[0]["name"]
    best_dist = float("inf")
    for d in _DISTRICT_COORDS:
        dlat = math.radians(d["lat"] - lat)
        dlon = math.radians(d["lon"] - lon)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(d["lat"])) * math.sin(dlon / 2) ** 2
        dist = 2 * 6371 * math.asin(math.sqrt(a))
        if dist < best_dist:
            best_dist = dist
            best_name = str(d["name"])
    return best_name

router = APIRouter()


def _serialize(alert: OfficialAlert) -> AlertRead:
    base = AlertRead.model_validate(alert)
    if alert.district:
        return base.model_copy(update={
            "district_slug": alert.district.slug,
            "district_name": alert.district.name,
        })
    return base


@router.get("/districts/{district_slug}/alerts", response_model=list[AlertRead])
def active_alerts(district_slug: str, db: DbSession) -> list[AlertRead]:
    district = district_crud.get_by_slug(db, district_slug)
    if not district:
        raise AppError("District not found", 404)

    # Fetch live weather forecast and upsert as official alert
    weather = fetch_weather_alert(district_slug)
    if weather:
        alert_crud.upsert_weather_alert(db, district.id, weather)

    return [_serialize(a) for a in alert_crud.active_for_district(db, district.id)]


@router.get("/alerts/active", response_model=list[AlertRead])
def all_active_alerts(db: DbSession, limit: int = 20) -> list[AlertRead]:
    """Returns all active official alerts across all districts (DB only — no live fetch)."""
    return [_serialize(a) for a in alert_crud.all_active(db, min(limit, 50))]


@router.get("/ndma-alerts")
async def ndma_kerala_alerts() -> list[dict[str, Any]]:
    """Proxy NDMA Sachet alerts filtered to Kerala. Bypasses browser CORS restriction."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://sachet.ndma.gov.in/cap_public_website/FetchAllAlertDetails",
                headers={"Accept": "application/json", "User-Agent": "LiveDisaster-Kerala/1.0"},
            )
            if not resp.is_success:
                return []
            raw: list[dict[str, Any]] = resp.json()
    except Exception:
        return []

    result: list[dict[str, Any]] = []
    for a in raw:
        if (a.get("actual_lang") or "en") != "en":
            continue
        area = a.get("area_description") or ""
        source = a.get("alert_source") or ""
        in_box, clat, clon = _in_kerala(a.get("centroid"))
        district_from_area = _detect_district(f"{area} {source}")
        source_mentions_kerala = bool(
            re.search(r"kerala|ksdma|thiruvananthapuram|kochi|imd.*tvm|imd thiruvananthapuram", source, re.IGNORECASE)
        )
        if not (district_from_area or in_box or source_mentions_kerala):
            continue

        sev, sev_label = _map_severity(a.get("severity_color") or "", a.get("severity_level") or "Advisory")
        district = district_from_area
        if not district and in_box and clat is not None and clon is not None:
            district = _nearest_district(clat, clon)

        result.append({
            "id": str(a.get("identifier", "")),
            "source": source or "NDMA Sachet",
            "disasterType": a.get("disaster_type") or "Alert",
            "severity": sev,
            "severityLabel": sev_label,
            "areaDescription": area or "Kerala",
            "message": a.get("warning_message") or "",
            "effectiveStart": a.get("effective_start_time"),
            "effectiveEnd": a.get("effective_end_time"),
            "district": district,
            "centroid": {"lat": clat, "lon": clon} if (in_box and clat is not None) else None,
        })

    result.sort(key=lambda x: x.get("effectiveStart") or "", reverse=True)
    return result[:80]
