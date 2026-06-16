"""
One-time script to remove the fake seeded reports and hardcoded alerts
that were inserted during initial development.

Run this ONCE from inside the backend container (or with the DB reachable):
    python clear_fake_data.py

After this, the community feed will be empty until real users submit reports.
Real weather-based alerts will be re-populated by seed.py on next startup.
"""

import os
import sqlalchemy as sa

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:password@localhost:5432/kerala_live",
)
engine = sa.create_engine(DATABASE_URL)


def clear() -> None:
    with engine.begin() as conn:
        # Delete in FK-safe order: dependents first
        v = conn.execute(sa.text("DELETE FROM verifications")).rowcount
        c = conn.execute(sa.text("DELETE FROM comments")).rowcount
        i = conn.execute(sa.text("DELETE FROM report_images")).rowcount
        r = conn.execute(sa.text("DELETE FROM reports")).rowcount
        # Remove only the hardcoded 'District Collector' alert from seed.py
        a = conn.execute(
            sa.text("DELETE FROM official_alerts WHERE source = 'District Collector'")
        ).rowcount

    print(f"✅  Cleared fake data:")
    print(f"    Reports:       {r}")
    print(f"    Comments:      {c}")
    print(f"    Verifications: {v}")
    print(f"    Images:        {i}")
    print(f"    Fake alerts:   {a}")
    print()
    print("The community feed is now empty — ready for real user submissions.")
    print("Restart the backend (or run seed.py) to populate real weather alerts.")


if __name__ == "__main__":
    clear()
