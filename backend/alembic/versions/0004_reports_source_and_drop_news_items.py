"""Add source_type + source_url to reports; drop news_items table

Revision ID: 0004_reports_source
Revises: 0003_news_items
Create Date: 2026-06-10
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0004_reports_source"
down_revision: str = "0003_news_items"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # News articles are stored as reports — add source metadata
    op.add_column("reports", sa.Column(
        "source_type", sa.String(20), nullable=False, server_default="community"
    ))
    op.add_column("reports", sa.Column(
        "source_url", sa.Text(), nullable=True
    ))
    op.create_index("ix_reports_source_url", "reports", ["source_url"])

    # Drop the separate news_items table we no longer need
    try:
        op.drop_index("ix_news_items_fetched_at", table_name="news_items")
        op.drop_index("ix_news_items_district_id", table_name="news_items")
        op.drop_table("news_items")
    except Exception:
        pass  # table may not exist if migration 0003 never ran


def downgrade() -> None:
    op.drop_index("ix_reports_source_url", table_name="reports")
    op.drop_column("reports", "source_url")
    op.drop_column("reports", "source_type")
