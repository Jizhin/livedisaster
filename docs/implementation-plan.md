# Implementation Plan

1. Create PostgreSQL database `kerala_live`.
2. Install backend dependencies from `backend/requirements.txt`.
3. Run `alembic upgrade head` from `backend/`.
4. Seed districts and sample reports through admin endpoints or SQL.
5. Start FastAPI with `uvicorn app.main:app --reload`.
6. Install frontend dependencies from `frontend/package.json`.
7. Start React with `npm run dev`.
8. Connect production image storage later if local disk uploads are not enough.
9. Add admin authentication only when explicitly required; it is intentionally excluded here.
10. Add responsive refinements after desktop behavior is accepted.

