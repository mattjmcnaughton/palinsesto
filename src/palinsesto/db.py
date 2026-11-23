"""Database engine and session configuration."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from palinsesto.config import settings


class Base(DeclarativeBase):
    """Shared metadata for application models and migrations."""


engine = create_async_engine(settings.database_url, hide_parameters=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session (use as a FastAPI dependency)."""
    async with async_session() as session:
        yield session
