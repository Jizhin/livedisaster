"""
Seed script — run automatically by docker-compose on every startup.

What it does:
  1. Inserts the 14 Kerala districts (skipped if already present).

What it does NOT do:
  - Insert fake community reports.
  - Insert fake official alerts.
  - Fetch weather data.
"""

import os

import sqlalchemy as sa

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:password@localhost:5432/kerala_live",
)
engine = sa.create_engine(DATABASE_URL)
metadata = sa.MetaData()

districts_table = sa.Table(
    "districts", metadata,
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("name", sa.String),
    sa.Column("slug", sa.String),
    sa.Column("is_active", sa.Boolean),
)

ALL_DISTRICTS = [
    {"name": "Thiruvananthapuram", "slug": "thiruvananthapuram"},
    {"name": "Kollam",             "slug": "kollam"},
    {"name": "Pathanamthitta",     "slug": "pathanamthitta"},
    {"name": "Alappuzha",          "slug": "alappuzha"},
    {"name": "Kottayam",           "slug": "kottayam"},
    {"name": "Idukki",             "slug": "idukki"},
    {"name": "Ernakulam",          "slug": "ernakulam"},
    {"name": "Thrissur",           "slug": "thrissur"},
    {"name": "Palakkad",           "slug": "palakkad"},
    {"name": "Malappuram",         "slug": "malappuram"},
    {"name": "Kozhikode",          "slug": "kozhikode"},
    {"name": "Wayanad",            "slug": "wayanad"},
    {"name": "Kannur",             "slug": "kannur"},
    {"name": "Kasaragod",          "slug": "kasaragod"},
]


def seed_data() -> None:
    with engine.begin() as conn:
        existing = conn.execute(
            sa.select(sa.func.count()).select_from(districts_table)
        ).scalar()

        if existing and existing > 0:
            print(f"Districts already present ({existing}). Skipping insert.")
        else:
            rows = [{"name": d["name"], "slug": d["slug"], "is_active": True}
                    for d in ALL_DISTRICTS]
            conn.execute(districts_table.insert(), rows)
            print(f"Inserted {len(rows)} Kerala districts.")


if __name__ == "__main__":
    seed_data()
