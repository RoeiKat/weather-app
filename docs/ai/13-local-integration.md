# Local integration testing

Date: **2026-10-07**. Local testing only; no production or architecture changes.

Docker Compose runs PostgreSQL 17 and the backend built from the existing
[Dockerfile](../../backend/Dockerfile). React/Vite runs on the host with its
existing development command. No host backend dependencies are needed.

## Prerequisites and configuration

- Start Docker Desktop with its Linux engine and Docker Compose available.
- Install Node.js 24 and npm (compatible with the frontend's Node.js >=22.12).
- Have an activated OpenWeather key with access to free five-day / three-hour
  forecasts and Direct Geocoding.

In PowerShell, from the repository root:

```powershell
Copy-Item .env.example .env
notepad .env
npm --prefix frontend ci
```

Copy only if a root `.env` does not already exist. Replace `PGPASSWORD` with
a local-only password and `OPENWEATHER_API_KEY` with your activated key. Keep
the other example values. Compose automatically reads this root `.env`;
the separate backend development `.env` is not used.

Never commit, stage, share, or paste `.env` or resolved Compose configuration
containing secrets. The root `.env` is **not currently gitignored** and may
appear in `git status`; leave it untracked. The key is passed only to the
backend, never to Vite. Do not put it in a `VITE_*` variable.

## Start the database and backend, then migrate

From the repository root:

```powershell
docker compose config --quiet
docker compose up --build -d
docker compose exec backend npm run migrate
curl.exe --fail http://localhost:3000/api/v1/health
```

Run the commands in order and stop on errors. The migration command must exit
successfully and log `migrations_completed`. It uses the existing compiled
runner and SQL files included in the backend image, including saved forecast
snapshots. Applied migrations are checksum-checked and skipped on subsequent
runs; rerun this command after pulling new migrations.

Compose waits for PostgreSQL readiness before starting the backend. Migrations
are explicit, not run automatically at API startup. Do not use the UI until
they succeed: health checks test database connectivity, not schema completion.
The health URL should return `{"status":"ok"}`.

This local configuration deliberately overrides the Dockerfile's production
mode with `NODE_ENV=development`, uses password database authentication and
non-Secure local HTTP session cookies, and disables database TLS only on the
Compose network. It is not suitable for deployment.

## Start the frontend

In a second PowerShell terminal, from the repository root:

```powershell
$env:WEATHER_API_PROXY = "http://localhost:3000"
npm --prefix frontend run dev -- --host localhost --port 5173 --strictPort
```

Open **http://localhost:5173**. The existing Vite proxy sends `/api/*` to the
backend while preserving the browser's Origin and same-origin cookie behavior.
The strict port prevents Vite silently moving to a port outside
`ALLOWED_ORIGINS`. Use `localhost`, not `127.0.0.1`, in the browser.

- Frontend: http://localhost:5173 (also `/register` and `/login`).
- Backend: http://localhost:3000/api/v1; bound to host loopback only.
- PostgreSQL: `postgres:5432` inside Compose; no host database port is published.
- Backend probe port 3001 stays unpublished.

Optionally check the proxy from another terminal:

```powershell
curl.exe --fail http://localhost:5173/api/v1/health
```

## Test the complete application

1. Search for a city, such as Stockholm, and confirm a multi-day Celsius forecast.
2. Register a synthetic account using a password of 12-128 Unicode code points,
   then log in (registration does not log in automatically).
3. Save a forecast point and confirm its snapshot appears in saved selections.
4. Reload and confirm your session and saved selection remain. Open the saved
   selection's fresh forecast; the stored snapshot should remain unchanged.
5. Delete the selection and log out.

Weather testing needs internet access and a working key. Authentication and
saved-list operations do not depend on OpenWeather availability. If startup,
migration, or requests fail, inspect services and logs:

```powershell
docker compose ps
docker compose logs --tail 100 postgres backend
```

## Stop or reset

Stop Vite with **Ctrl+C** in its terminal. From the repository root:

```powershell
docker compose down
```

The named volume preserves database data for the next startup. To intentionally
erase all local users, sessions, saved selections, and migration state:

```powershell
docker compose down --volumes
```

Then repeat startup and migrations. Clear this site's browser cookies if needed
after resetting. Changing database credentials in `.env` does not update an
already initialized PostgreSQL volume; reset disposable local data first.

## AI assistance and verification

- Tool: AI assistant using Copilot SDK in VS Code; model Unknown.
- Request summary: add only a minimal local Compose environment, safe example
  variables, and exact integration instructions; do not change application code,
  infrastructure, workflows, or architecture; do not stage or commit.
- Basis: existing frontend proxy/API implementation, backend configuration,
  Dockerfile, package scripts, SQL migration runner, API contract, and application
  agent rules. No new application architecture or migration tooling was added.
- Human decision: the user authorized this local-only scope; production decisions
  remain unchanged.
- Verification: `docker compose --env-file .env.example config --quiet` passed
  with Docker Compose v5.5.1. Resolved configuration checks confirmed exactly two
  services, local development mode, the internal PostgreSQL host, key injection
  from example configuration, loopback-only backend exposure, no published
  database port, and the database readiness dependency. Container build/startup,
  migrations, browser flows, and real OpenWeather access have not been tested
  because the Docker engine is not running.
