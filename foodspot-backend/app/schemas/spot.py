from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class FoodSpotOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    image_path: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    location_text: Optional[str]
    district: Optional[str]
    category: Optional[str]
    confirmed_count: int
    not_here_count: int = 0
    created_at: datetime
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DistrictStats(BaseModel):
    district: str
    count: int


class AppStats(BaseModel):
    total_spots: int
