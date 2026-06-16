from app.models.verification import VerificationKind
from app.schemas.common import ORMModel


class VerificationCreate(ORMModel):
    kind: VerificationKind
    voter_name: str | None = None


class VerificationCounts(ORMModel):
    confirmed_count: int
    incorrect_count: int
    resolved_count: int

