from fastapi import APIRouter
from app.api.routes import admin, alerts, comments, districts, images, news_reports, reports, stats, verifications

api_router = APIRouter()
api_router.include_router(districts.router, tags=["Districts"])
api_router.include_router(alerts.router, tags=["Official Alerts"])
api_router.include_router(reports.router, tags=["Reports"])
api_router.include_router(stats.router, tags=["Stats"])
api_router.include_router(news_reports.router, tags=["News Reports"])
api_router.include_router(comments.router, tags=["Comments"])
api_router.include_router(verifications.router, tags=["Verification"])
api_router.include_router(images.router, tags=["Images"])
api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
