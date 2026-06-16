"""add latitude/longitude to reports

Revision ID: 0002_report_coordinates
Revises: 0001_initial
Create Date: 2026-06-10
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0002_report_coordinates"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("reports", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "longitude")
    op.drop_column("reports", "latitude")
