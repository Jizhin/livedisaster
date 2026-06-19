import math
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, List

from ..core.database import get_db
from ..models.spot import FoodSpot
from ..schemas.spot import FoodSpotOut, DistrictStats, AppStats
from ..services.images import save_image

router = APIRouter(prefix="/api", tags=["spots"])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))

DISTRICTS = [
    "Kasaragod", "Kannur", "Wayanad", "Kozhikode", "Malappuram",
    "Palakkad", "Thrissur", "Ernakulam", "Idukki", "Kottayam",
    "Alappuzha", "Pathanamthitta", "Kollam", "Thiruvananthapuram",
]


@router.get("/stats", response_model=AppStats)
def get_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(FoodSpot.id)).scalar() or 0
    return {"total_spots": total}


@router.get("/districts", response_model=List[DistrictStats])
def get_districts(db: Session = Depends(get_db)):
    counts = (
        db.query(FoodSpot.district, func.count(FoodSpot.id).label("count"))
        .group_by(FoodSpot.district)
        .all()
    )
    count_map = {row.district: row.count for row in counts}
    return [{"district": d, "count": count_map.get(d, 0)} for d in DISTRICTS]


@router.get("/spots", response_model=List[FoodSpotOut])
def list_spots(district: Optional[str] = None, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    query = db.query(FoodSpot).filter(
        (FoodSpot.expires_at.is_(None)) | (FoodSpot.expires_at > now)
    )
    if district:
        query = query.filter(FoodSpot.district == district)
    return query.order_by(FoodSpot.created_at.desc()).limit(100).all()


@router.get("/spots/nearby", response_model=List[FoodSpotOut])
def get_nearby_spots(
    lat: float, lng: float, radius_km: float = 5.0,
    db: Session = Depends(get_db),
):
    spots = (
        db.query(FoodSpot)
        .filter(FoodSpot.latitude.isnot(None), FoodSpot.longitude.isnot(None))
        .all()
    )
    nearby = [s for s in spots if _haversine_km(lat, lng, s.latitude, s.longitude) <= radius_km]
    nearby.sort(key=lambda s: _haversine_km(lat, lng, s.latitude, s.longitude))
    return nearby


@router.get("/spots/map-bounds", response_model=List[FoodSpotOut])
def get_spots_in_bounds(
    sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float,
    db: Session = Depends(get_db),
):
    return (
        db.query(FoodSpot)
        .filter(
            FoodSpot.latitude.isnot(None),
            FoodSpot.longitude.isnot(None),
            FoodSpot.latitude.between(sw_lat, ne_lat),
            FoodSpot.longitude.between(sw_lng, ne_lng),
        )
        .limit(300)
        .all()
    )


@router.get("/spots/{spot_id}", response_model=FoodSpotOut)
def get_spot(spot_id: int, db: Session = Depends(get_db)):
    spot = db.query(FoodSpot).filter(FoodSpot.id == spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    return spot


@router.post("/spots", response_model=FoodSpotOut)
async def create_spot(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    location_text: Optional[str] = Form(None),
    district: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    image_path = None
    if image and image.filename:
        image_path = await save_image(image)

    expires_at = datetime.now(timezone.utc) + timedelta(hours=4)

    spot = FoodSpot(
        title=title,
        description=description,
        image_path=image_path,
        latitude=latitude,
        longitude=longitude,
        location_text=location_text,
        district=district,
        category=category,
        expires_at=expires_at,
    )
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot


@router.post("/spots/{spot_id}/confirm", response_model=FoodSpotOut)
def confirm_spot(spot_id: int, db: Session = Depends(get_db)):
    spot = db.query(FoodSpot).filter(FoodSpot.id == spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    spot.confirmed_count += 1
    db.commit()
    db.refresh(spot)
    return spot


@router.post("/spots/{spot_id}/not-here", response_model=FoodSpotOut)
def not_here_spot(spot_id: int, db: Session = Depends(get_db)):
    spot = db.query(FoodSpot).filter(FoodSpot.id == spot_id).first()
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    spot.not_here_count = (spot.not_here_count or 0) + 1
    db.commit()
    db.refresh(spot)
    return spot
