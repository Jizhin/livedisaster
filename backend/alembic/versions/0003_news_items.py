"""news_items table for Manorama articles stored as feed entries

Revision ID: 0003_news_items
Revises: 0002_report_coordinates
Create Date: 2026-06-10
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0003_news_items"
down_revision: str = "0002_report_coordinates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("article_url", sa.Text(), nullable=False),
        sa.Column("sub_district", sa.String(80), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("source", sa.String(40), nullable=False, server_default="manorama"),
        sa.UniqueConstraint("article_url", name="uq_news_items_article_url"),
    )
    op.create_index("ix_news_items_district_id", "news_items", ["district_id"])
    op.create_index("ix_news_items_fetched_at", "news_items", ["fetched_at"])


def downgrade() -> None:
    op.drop_index("ix_news_items_fetched_at")
    op.drop_index("ix_news_items_district_id")
    op.drop_table("news_items")
