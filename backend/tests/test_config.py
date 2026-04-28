import pytest

from backend.app.core.config import Settings


def test_production_settings_require_strong_secret_and_remote_database() -> None:
    with pytest.raises(ValueError):
        Settings(environment="production")


def test_production_settings_accept_safe_values() -> None:
    settings = Settings(
        environment="production",
        database_url="postgresql+psycopg://user:password@db.example.com:5432/vip_tailors",
        jwt_secret_key="this-is-a-very-long-production-secret-12345",
        cors_allow_origins="https://app.example.com,https://admin.example.com",
    )

    assert settings.environment == "production"
    assert settings.cors_allow_origins == ["https://app.example.com", "https://admin.example.com"]


def test_list_settings_accept_comma_separated_strings() -> None:
    settings = Settings(
        cors_allow_origins="http://localhost:3000, http://127.0.0.1:3000",
        cors_allow_methods="GET,POST,DELETE",
        cors_allow_headers="Authorization, Content-Type",
    )

    assert settings.cors_allow_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert settings.cors_allow_methods == ["GET", "POST", "DELETE"]
    assert settings.cors_allow_headers == ["Authorization", "Content-Type"]
