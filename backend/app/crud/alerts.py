from datetime import date, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.alert import OfficialAlert
from app.schemas.alert import AlertCreate

_WEATHER_SOURCE = "IMD / Open-Meteo Forecast"


def _with_district():
    return select(OfficialAlert).options(selectinload(OfficialAlert.district))


def active_for_district(db: Session, district_id: int) -> list[OfficialAlert]:
    return list(
        db.scalars(
            _with_district()
            .where(OfficialAlert.district_id == district_id, OfficialAlert.is_active.is_(True))
            .order_by(OfficialAlert.created_at.desc())
        )
    )


def all_active(db: Session, limit: int = 20) -> list[OfficialAlert]:
    return list(
        db.scalars(
            _with_district()
            .where(OfficialAlert.is_active.is_(True))
            .order_by(OfficialAlert.created_at.desc())
            .limit(limit)
        )
    )


def upsert_weather_alert(db: Session, district_id: int, data: dict) -> None:
    today = date.today()
    existing = db.scalar(
        select(OfficialAlert).where(
            OfficialAlert.district_id == district_id,
            OfficialAlert.source == _WEATHER_SOURCE,
            func.date(OfficialAlert.created_at) == today,
        )
    )
    if existing:
        existing.title = data["title"]
        existing.content = data["content"]
        existing.severity = data["severity"]
        existing.is_active = True
        existing.created_at = datetime.utcnow()
        db.commit()
    else:
        db.execute(
            update(OfficialAlert)
            .where(
                OfficialAlert.district_id == district_id,
                OfficialAlert.source == _WEATHER_SOURCE,
            )
            .values(is_active=False)
        )
        db.add(OfficialAlert(
            district_id=district_id,
            title=data["title"],
            content=data["content"],
            source=_WEATHER_SOURCE,
            severity=data["severity"],
            is_active=True,
        ))
        db.commit()


def create(db: Session, payload: AlertCreate) -> OfficialAlert:
    alert = OfficialAlert(**payload.model_dump())
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert
