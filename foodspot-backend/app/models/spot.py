from sqlalchemy import Column, Integer, String, Text, Float, DateTime, func
from ..core.database import Base


class FoodSpot(Base):
    __tablename__ = "food_spots"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    image_path = Column(String(500))
    latitude = Column(Float)
    longitude = Column(Float)
    location_text = Column(String(500))
    district = Column(String(100), index=True)
    category = Column(String(50))
    confirmed_count = Column(Integer, default=0)
    not_here_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))
