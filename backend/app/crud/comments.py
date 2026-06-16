from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.comment import Comment
from app.schemas.comment import CommentCreate, CommentModeration


def create(db: Session, report_id: int, payload: CommentCreate) -> Comment:
    comment = Comment(report_id=report_id, **payload.model_dump())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def list_for_report(db: Session, report_id: int) -> list[Comment]:
    return list(
        db.scalars(
            select(Comment)
            .where(Comment.report_id == report_id, Comment.is_approved.is_(True))
            .order_by(Comment.created_at)
        )
    )


def moderate(db: Session, comment_id: int, payload: CommentModeration) -> Comment | None:
    comment = db.get(Comment, comment_id)
    if not comment:
        return None
    comment.is_approved = payload.is_approved
    db.commit()
    db.refresh(comment)
    return comment

