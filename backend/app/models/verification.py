import enum
from datetime import datetime
from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class VerificationKind(str, enum.Enum):
    confirm = "confirm"
    incorrect = "incorrect"
    resolved = "resolved"


class Verification(Base):
    __tablename__ = "verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), index=True)
    kind: Mapped[VerificationKind] = mapped_column(Enum(VerificationKind), index=True)
    voter_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    report = relationship("Report", back_populates="verifications")

