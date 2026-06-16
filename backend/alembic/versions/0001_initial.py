"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-09
"""
from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


report_status = sa.Enum("new", "verified", "disputed", "resolved", "rejected", name="reportstatus")
verification_kind = sa.Enum("confirm", "incorrect", "resolved", name="verificationkind")


def upgrade() -> None:
    op.create_table(
        "districts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_districts_name", "districts", ["name"])
    op.create_index("ix_districts_slug", "districts", ["slug"])

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id"), nullable=False),
        sa.Column("reporter_name", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", report_status, nullable=False, server_default="new"),
        sa.Column("location_attached", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_reports_created_at", "reports", ["created_at"])
    op.create_index("ix_reports_district_id", "reports", ["district_id"])
    op.create_index("ix_reports_is_approved", "reports", ["is_approved"])
    op.create_index("ix_reports_status", "reports", ["status"])

    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("author_name", sa.String(length=80), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comments_created_at", "comments", ["created_at"])
    op.create_index("ix_comments_is_approved", "comments", ["is_approved"])
    op.create_index("ix_comments_report_id", "comments", ["report_id"])

    op.create_table(
        "verifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("kind", verification_kind, nullable=False),
        sa.Column("voter_name", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_verifications_created_at", "verifications", ["created_at"])
    op.create_index("ix_verifications_kind", "verifications", ["kind"])
    op.create_index("ix_verifications_report_id", "verifications", ["report_id"])

    op.create_table(
        "report_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("report_id", sa.Integer(), sa.ForeignKey("reports.id"), nullable=False),
        sa.Column("file_path", sa.String(length=255), nullable=False),
        sa.Column("alt_text", sa.String(length=160), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_report_images_report_id", "report_images", ["report_id"])

    op.create_table(
        "official_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("district_id", sa.Integer(), sa.ForeignKey("districts.id"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False, server_default="District Collector"),
        sa.Column("severity", sa.String(length=40), nullable=False, server_default="official"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_official_alerts_created_at", "official_alerts", ["created_at"])
    op.create_index("ix_official_alerts_district_id", "official_alerts", ["district_id"])
    op.create_index("ix_official_alerts_is_active", "official_alerts", ["is_active"])


def downgrade() -> None:
    op.drop_table("official_alerts")
    op.drop_table("report_images")
    op.drop_table("verifications")
    op.drop_table("comments")
    op.drop_table("reports")
    op.drop_table("districts")
    verification_kind.drop(op.get_bind(), checkfirst=True)
    report_status.drop(op.get_bind(), checkfirst=True)
