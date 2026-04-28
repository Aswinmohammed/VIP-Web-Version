from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/vip_tailors"
DEFAULT_JWT_SECRET = "change-me-before-production"


class Settings(BaseSettings):
    app_name: str = "VIP Tailors SaaS API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = DEFAULT_DATABASE_URL
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expires_minutes: int = 60
    refresh_token_expires_days: int = 7
    sql_echo: bool = False
    create_tables_on_startup: bool = False
    cors_allow_origins: Annotated[list[str], NoDecode] = Field(default_factory=lambda: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ])
    cors_allow_methods: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    cors_allow_headers: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["Authorization", "Content-Type"])
    invoice_company_name: str = "VIP Tailors & Fashion Pvt Ltd"
    invoice_currency: str = "LKR"

    @field_validator("environment", mode="before")
    @classmethod
    def _normalize_environment(cls, value: object) -> str:
        return str(value or "development").strip().lower()

    @field_validator("cors_allow_origins", "cors_allow_methods", "cors_allow_headers", mode="before")
    @classmethod
    def _normalize_list_setting(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            parts = [part.strip() for part in value.split(",")]
            return [part for part in parts if part]
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]
        return [str(value).strip()]

    @model_validator(mode="after")
    def _validate_production_settings(self) -> "Settings":
        if self.environment != "production":
            return self

        if self.jwt_secret_key == DEFAULT_JWT_SECRET or len(self.jwt_secret_key) < 32:
            raise ValueError("VIP_JWT_SECRET_KEY must be set to a strong production secret.")

        database_url_lower = self.database_url.lower()
        if self.database_url == DEFAULT_DATABASE_URL or "localhost" in database_url_lower or "127.0.0.1" in database_url_lower:
            raise ValueError("VIP_DATABASE_URL must point to a real production database, not localhost.")

        if not self.cors_allow_origins:
            raise ValueError("VIP_CORS_ALLOW_ORIGINS must include at least one allowed frontend origin in production.")

        return self

    model_config = SettingsConfigDict(
        env_prefix="VIP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
