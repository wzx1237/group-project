"""FastAPI routes; install verified UMD SSO before serving real requests."""
from contextlib import asynccontextmanager
from decimal import Decimal
from typing import Annotated
from uuid import uuid4
import logging
import os

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt
import psycopg

from database import Database
from .service import GradingService, GradingError

logger = logging.getLogger(__name__)


def get_current_staff(request: Request) -> str:
    # Trusted authentication middleware sets this after validating UMD SSO.
    # Never derive identity from a body parameter or an unverified HTTP header.
    actor = getattr(request.state, 'directory_ID', None)
    if not isinstance(actor, str) or not actor or actor != actor.lower():
        raise HTTPException(401, 'Verified staff authentication is required')
    return actor


class GradeInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    directory_ID: str = Field(min_length=1)
    labels: list[Annotated[StrictInt, Field(gt=0)]]
    comments: str | None = None


class RubricInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=50)
    description: str | None = None
    deduction: Decimal = Field(max_digits=5, decimal_places=2, allow_inf_nan=False)


def create_app(db: Database | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        owned = db is None
        database = db or Database(
            host=os.environ.get('PGHOST', 'localhost'),
            port=os.environ.get('PGPORT', '5432'),
            dbname=os.environ.get('PGDATABASE', 'gradeflow'),
            user=os.environ.get('PGUSER', 'gradeflow'),
            password=os.environ.get('PGPASSWORD', ''),
        )
        app.state.database = database
        try:
            database.pool.wait(timeout=10)
            yield
        finally:
            if owned:
                database.close()

    app = FastAPI(title='Gradeflow grading API', lifespan=lifespan)
    if db is not None:
        app.state.database = db

    @app.exception_handler(GradingError)
    async def grading_error(request, error):
        return JSONResponse(status_code=error.status_code, content={'detail': error.detail})

    @app.exception_handler(psycopg.Error)
    async def database_error(request, error):
        if isinstance(error, (psycopg.errors.LockNotAvailable,
                              psycopg.errors.DeadlockDetected,
                              psycopg.errors.SerializationFailure,
                              psycopg.errors.QueryCanceled)):
            return JSONResponse(status_code=503, headers={'Retry-After': '1'},
                                content={'detail': 'Database busy; refresh workspace before retrying'})
        if isinstance(error, psycopg.DataError):
            return JSONResponse(status_code=422, content={'detail': 'Value cannot be stored in the database'})
        if isinstance(error, psycopg.IntegrityError):
            return JSONResponse(status_code=409, content={'detail': 'Data changed or conflicts with a database constraint'})
        logger.error('Database request failed', exc_info=(type(error), error, error.__traceback__))
        return JSONResponse(status_code=500, content={'detail': 'Database request failed'})

    def service(request: Request, exam_ID: int,
                actor: Annotated[str, Depends(get_current_staff)],
                if_match: Annotated[str | None, Header()] = None):
        return GradingService(request.app.state.database, actor_ID=actor,
                              exam_ID=exam_ID, expected_token=if_match,
                              request_ID=str(uuid4()))

    Service = Annotated[GradingService, Depends(service)]

    @app.get('/exams/{exam_ID}/students/{UID}/questions/{QID}/workspace')
    def workspace(exam_ID: int, UID: int, QID: str, operation: Service):
        return operation.workspace(exam_ID, UID, QID)

    @app.get('/exams/{exam_ID}/questions/{QID}/rubric')
    def rubric(exam_ID: int, QID: str, operation: Service):
        return operation.rubric_snapshot(exam_ID, QID)

    @app.post('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade', status_code=201)
    def grade(exam_ID: int, UID: int, QID: str, body: GradeInput, operation: Service):
        return operation.grade(exam_ID, UID, QID, body.directory_ID, body.labels, body.comments)

    @app.post('/exams/{exam_ID}/questions/{QID}/rubric/labels', status_code=201)
    def change_rubric(exam_ID: int, QID: str, body: RubricInput, operation: Service):
        return operation.change_rubric(body.title, body.description, body.deduction, QID)

    @app.put('/exams/{exam_ID}/students/{UID}/questions/{QID}/grade')
    def regrade(exam_ID: int, UID: int, QID: str, body: GradeInput, operation: Service):
        return operation.regrade(exam_ID, UID, QID, body.directory_ID, body.labels, body.comments)

    return app


app = create_app()
