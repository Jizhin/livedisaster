from datetime import datetime
from pydantic import Field
from app.schemas.common import ORMModel


class CommentCreate(ORMModel):
    author_name: str = Field(min_length=1, max_length=80)
    content: str = Field(min_length=1, max_length=500)


class CommentRead(CommentCreate):
    id: int
    report_id: int
    is_approved: bool
    created_at: datetime


class CommentModeration(ORMModel):
    is_approved: bool

