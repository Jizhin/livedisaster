"""site_settings table

Revision ID: 002
Revises: 001
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_site_settings_id", "site_settings", ["id"])
    op.create_index("ix_site_settings_key", "site_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_site_settings_key", "site_settings")
    op.drop_index("ix_site_settings_id", "site_settings")
    op.drop_table("site_settings")
