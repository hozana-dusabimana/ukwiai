from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ENVIRONMENT: str = "development"

    # DB
    DB_HOST: str = "database"
    DB_PORT: int = 3306
    DB_NAME: str = "ukwi_db"
    DB_USER: str = "ukwi_user"
    DB_PASSWORD: str = "change_me"

    # Auth
    JWT_SECRET_KEY: str = "change_me_to_a_long_random_string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI service
    AI_SERVICE_URL: str = "http://ai_service:8001"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost"

    # Storage
    UPLOAD_DIR: str = "/app/storage/uploads"
    REPORTS_DIR: str = "/app/storage/reports"
    MAX_UPLOAD_SIZE_MB: int = 20

    # Alert thresholds
    BUDGET_OVERRUN_PERCENT: float = 5.0
    DELAY_ALERT_DAYS: int = 7

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
