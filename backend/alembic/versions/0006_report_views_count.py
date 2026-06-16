"""Add views_count to reports

Revision ID: 0006_report_views_count
Revises: 0005_report_location_fields
Create Date: 2026-06-13
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0006_report_views_count"
down_revision: str = "0005_report_location_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("views_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("reports", "views_count")
