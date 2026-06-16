from fastapi import APIRouter
from app.api.deps import DbSession
from app.core.errors import AppError
from app.crud import alerts as alert_crud
from app.crud import districts as district_crud
from app.models.alert import OfficialAlert
from app.schemas.alert import AlertRead
from app.services.weather import fetch_weather_alert

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
