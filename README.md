# GradeFlow

Web app for grading scanned exams (CMSC435 Fall 26 project). Course staff sign in with their UMD Directory ID through UMD CAS.

## What's here

- `backend/` - FastAPI API: UMD CAS sign-in and exam distribution (upload one scanned PDF, split it into exams, read each cover's UID, match exams to the roster).
- `frontend/` - Next.js app.
- `data/` - course config, rosters (fake students for now), the cover template and the UID-reading model. While running, the backend also writes `db.json`, `uploads/` and `submissions/` here. Git ignores those.
- `docker-compose.yml` - PostgreSQL for local development.

## One-time setup

1. UMD CAS rejects `localhost`, so we use `gradeflow.test` as another name for your machine:

       echo "127.0.0.1 gradeflow.test" | sudo tee -a /etc/hosts

2. Database: install [Docker Desktop](https://www.docker.com/products/docker-desktop/), then from the repo root:

       docker compose up -d db

   This starts PostgreSQL in the background. It keeps its data between restarts; run the same command again after rebooting.

3. Backend (Python 3.14):

       cd backend
       python3 -m venv .venv
       source .venv/bin/activate
       pip install -r requirements.txt
       cp .env.example .env

   In `.env`, set `SESSION_SECRET` (the file shows how to make one). Then load the course, its staff and its students into the database:

       python -m app.seed

   Only people in `data/rosters/class-roster-ta-source.csv` can sign in. To add someone, add a row there and run the command again.

4. Frontend (Node 20+):

       cd frontend
       npm install

## Run

With the database running (`docker compose up -d db`), two terminals:

    cd backend && source .venv/bin/activate && uvicorn app.main:create_app --factory --reload
    cd frontend && npm run dev

Open http://gradeflow.test:3000 (not localhost) and sign in. The frontend forwards `/api` requests to the backend on port 8000. API docs: http://gradeflow.test:3000/api/docs

Only Quiz 1 has a cover template right now, so upload scans to Quiz 1.

## Tests

    cd backend && pytest

## Docker (optional)

To run the backend in Docker instead of the venv, from the repo root:

    docker build -t gradeflow-backend backend
    docker run --rm -p 8000:8000 --env-file backend/.env -v "$PWD/data:/data" \
      -e DATABASE_URL=postgresql://gradeflow:gradeflow@host.docker.internal:5432/gradeflow gradeflow-backend

## Notes

- Never commit `.env` or real student data (real rosters, uploaded scans).
