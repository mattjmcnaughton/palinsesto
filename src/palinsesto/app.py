"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from palinsesto.config import settings
from palinsesto.logging import configure_logging
from palinsesto.oidc import OIDCProvider
from palinsesto.routers import browser_auth, desk, health, spotify
from palinsesto.services.access import RejectionError
from palinsesto.web.serve import mount_frontend


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    configure_logging()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="palinsesto",
        description=(
            "A radio programmer's desk for planning a weekly mix of whole albums."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    app.state.auth_settings = settings
    app.state.oidc_provider = OIDCProvider(settings)

    @app.middleware("http")
    async def private_api_responses(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(RejectionError)
    async def rejected(_request, error):
        return JSONResponse(
            status_code=error.status,
            content={"detail": {"code": error.code, "message": error.message}},
            headers={"Cache-Control": "no-store"},
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_failure(_request, _error):
        # Never echo bind parameters; they can hold notes and secrets.
        return JSONResponse(
            status_code=503,
            content={
                "detail": {
                    "code": "storage_unavailable",
                    "message": "The change was not saved. Try again.",
                }
            },
        )

    app.include_router(browser_auth.router)
    app.include_router(health.router)
    app.include_router(desk.router)
    app.include_router(spotify.router)

    # Mount frontend static files (only serves if dist/ exists)
    mount_frontend(app)

    return app


app = create_app()
