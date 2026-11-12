# GradeFlow

Web app for grading scanned exams (CMSC435 Fall 26 project). Course staff sign in with their UMD Directory ID through UMD CAS.

## What's here

- `backend/` - FastAPI API: UMD CAS sign-in and exam distribution (upload one scanned PDF, split it into exams, read each cover's UID, match exams to the roster).
- `frontend/` - Next.js app.
- `data/` - course config, rosters (fake students for now), the cover template and the UID-reading model. While running, the backend also writes `db.json`, `uploads/` and `submissions/` here. Git ignores those.
- `docker-compose.yml` - PostgreSQL for local development.

## Quick start

You need to install a few things yourself the first time:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (open it so it is running)
- Python 3.14
- Node 20+
- A hosts entry. UMD CAS rejects `localhost`, so we use `gradeflow.test` as another name for your machine (needs sudo, so `dev.sh` can't do it for you):

      echo "127.0.0.1 gradeflow.test" | sudo tee -a /etc/hosts

Then, from the repo root:

    ./dev.sh

On the first run this does the rest of the setup for you:

- starts PostgreSQL in Docker and waits until it is ready
- creates `backend/.env` from `.env.example` and generates a `SESSION_SECRET`
- creates `backend/.venv` and installs the Python dependencies
- installs the frontend dependencies (`npm ci`)
- loads the course, its staff and its students into the database
- starts the backend (port 8000) and the frontend (port 3000)

Later runs skip anything already done, so `./dev.sh` is also how you start the app day to day. When it prints "Setup done", open http://gradeflow.test:3000 (not localhost) and sign in. API docs: http://gradeflow.test:3000/api/docs

Press Ctrl+C to stop the backend and frontend. PostgreSQL keeps running in Docker; stop it with `docker compose down`. Use `./dev.sh --no-seed` to skip loading the seed data.

Only people in `data/rosters/class-roster-ta-source.csv` can sign in. To add someone, add a row there and run `./dev.sh` again.

Only Quiz 1 has a cover template right now, so upload scans to Quiz 1.

## Manual setup (optional)

If you would rather run the steps yourself instead of `./dev.sh`:

1. Add the hosts entry above, then start the database from the repo root: `docker compose up -d db`. It keeps its data between restarts; run it again after rebooting.

2. Backend:

       cd backend
       python3 -m venv .venv
       source .venv/bin/activate
       pip install -r requirements.txt
       cp .env.example .env

   In `.env`, set `SESSION_SECRET` (the file shows how to make one). Then load the seed data:

       python -m app.seed

3. Frontend:

       cd frontend
       npm install

4. Run, in two terminals:

       cd backend && source .venv/bin/activate && uvicorn app.main:create_app --factory --reload
       cd frontend && npm run dev

## Tests

    cd backend && pytest

## Docker (optional)

To run the backend in Docker instead of the venv, from the repo root:

    docker build -t gradeflow-backend backend
    docker run --rm -p 8000:8000 --env-file backend/.env -v "$PWD/data:/data" \
      -e DATABASE_URL=postgresql://gradeflow:gradeflow@host.docker.internal:5432/gradeflow gradeflow-backend

## Notes

- Never commit `.env` or real student data (real rosters, uploaded scans).
