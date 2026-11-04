"""GradeFlow API.

Run from backend/:  uvicorn app.main:create_app --factory --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app import config, db
from app.routing import distribution, grading, rubrics
from app.routing.auth import router as auth_router
from app.settings import Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    with db.open_database(app.state.settings.database_url) as pool:
        app.state.db = pool
        async with distribution.lifespan(app):
            yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(
        title="GradeFlow",
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    app.state.settings = settings
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        session_cookie="gf_session",
        max_age=settings.session_idle_hours * 3600,
        same_site="lax",  # "strict" breaks the redirect back from CAS
        https_only=settings.app_base_url.startswith("https://"),
    )
    app.add_exception_handler(config.ConfigError, distribution.config_error)
    app.include_router(auth_router)
    app.include_router(distribution.router)
    app.include_router(rubrics.router)
    app.include_router(grading.router)
    return app
