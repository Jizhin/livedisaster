from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://foodspot_user:foodspot_pass@localhost:5433/foodspot"
    cors_origins: List[str] = ["http://localhost:5174"]
    upload_dir: str = "uploads"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
