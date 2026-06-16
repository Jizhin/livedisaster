"""Add locality, state, country, pincode to reports

Revision ID: 0005_report_location_fields
Revises: 0004_reports_source
Create Date: 2026-06-12
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0005_report_location_fields"
down_revision: str = "0004_reports_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("locality", sa.String(120), nullable=True))
    op.add_column("reports", sa.Column("state",    sa.String(80),  nullable=True))
    op.add_column("reports", sa.Column("country",  sa.String(80),  nullable=True))
    op.add_column("reports", sa.Column("pincode",  sa.String(20),  nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "pincode")
    op.drop_column("reports", "country")
    op.drop_column("reports", "state")
    op.drop_column("reports", "locality")
