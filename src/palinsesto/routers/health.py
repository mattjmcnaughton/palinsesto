"""Health check endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["health"])

# Bump deliberately when adopting a new schema; rollback compatibility must be
# assessed before changing this contract. Connectivity alone cannot admit traffic.
SCHEMA_REVISION = "0001"


@router.get("/healthz")
async def healthz() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> JSONResponse:
    """Database connectivity and the application's supported migration revision.

    Provider compatibility and browser/MCP configuration are separate release gates.
    """
    from sqlalchemy import text

    from palinsesto.db import async_session

    try:
        async with async_session() as session:
            result = await session.execute(
                text("SELECT version_num FROM alembic_version")
            )
            revision = result.scalar_one_or_none()
            if revision != SCHEMA_REVISION:
                return JSONResponse(
                    {"status": "not ready", "database": "schema incompatible"},
                    status_code=503,
                )
    except Exception:
        return JSONResponse(
            {"status": "not ready", "database": "unreachable"}, status_code=503
        )
    return JSONResponse({"status": "ready"})
