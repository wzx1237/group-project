"""GradeFlow API.

Run from backend/:  uvicorn app.main:create_app --factory --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import psycopg
from starlette.middleware.sessions import SessionMiddleware

from app import config, db
from app.database import Database
from app.routing import distribution, grading, rubrics
from app.routing.auth import router as auth_router
from app.settings import Settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    with db.open_database(app.state.settings.database_url) as pool:
        app.state.db = pool
        app.state.grading_db = Database.from_pool(pool) if pool is not None else None
        try:
            async with distribution.lifespan(app):
                yield
        finally:
            if app.state.grading_db is not None:
                app.state.grading_db._flush_audit_safely()


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
    @app.exception_handler(psycopg.Error)
    async def database_error(request: Request, error: psycopg.Error):
        if error.sqlstate in {'40001', '40P01', '55P03', '57014'}:
            return JSONResponse(status_code=503, content={'detail': 'Database busy; refresh before retrying'},
                                headers={'Retry-After': '1'})
        if error.sqlstate and error.sqlstate.startswith('23'):
            return JSONResponse(status_code=409, content={'detail': 'Database constraint conflict'})
        logging.getLogger(__name__).exception('Database operation failed')
        return JSONResponse(status_code=500, content={'detail': 'Database operation failed'})

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
