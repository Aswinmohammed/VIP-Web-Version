from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings


settings = get_settings()

database_url = make_url(settings.database_url)
engine_options = {
    "echo": settings.sql_echo,
    "future": True,
    "pool_pre_ping": True,
}
if database_url.drivername.startswith("postgresql"):
    engine_options.update(
        {
            "pool_size": 10,
            "max_overflow": 20,
            "pool_recycle": 1800,
            "pool_timeout": 30,
        }
    )

engine = create_engine(settings.database_url, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
