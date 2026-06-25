"""Add severity and category to reports

Revision ID: 0007_report_severity_category
Revises: 0006_report_views_count
Create Date: 2026-06-25
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0007_report_severity_category"
down_revision: str = "0006_report_views_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reports", sa.Column("severity", sa.String(10), nullable=False, server_default="warn"))
    op.add_column("reports", sa.Column("category", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("reports", "category")
    op.drop_column("reports", "severity")
