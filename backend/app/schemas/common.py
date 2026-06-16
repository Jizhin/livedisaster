from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ImageRead(ORMModel):
    id: int
    file_path: str
    alt_text: str | None = None
    created_at: datetime

