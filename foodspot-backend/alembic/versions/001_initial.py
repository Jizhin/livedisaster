"""initial

Revision ID: 001
Revises:
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "food_spots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("image_path", sa.String(500), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_text", sa.String(500), nullable=True),
        sa.Column("district", sa.String(100), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("confirmed_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_food_spots_id", "food_spots", ["id"])
    op.create_index("ix_food_spots_district", "food_spots", ["district"])


def downgrade() -> None:
    op.drop_index("ix_food_spots_district", "food_spots")
    op.drop_index("ix_food_spots_id", "food_spots")
    op.drop_table("food_spots")
