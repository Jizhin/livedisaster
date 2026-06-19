from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import text

from .core.config import settings
from .core.database import engine
from .routers.spots import router as spots_router
from .routers.settings import router as settings_router

app = FastAPI(title="FoodSpot Undo API", version="1.0.0")


@app.on_event("startup")
def run_migrations():
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE food_spots ADD COLUMN IF NOT EXISTS not_here_count INTEGER DEFAULT 0 NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE food_spots ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE"
        ))
        conn.commit()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_dir = Path(settings.upload_dir)
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

app.include_router(spots_router)
app.include_router(settings_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "foodspot-undo"}
