# Renewals (SubTracker)

A personal subscription tracker. Add the apps and services you pay for, see what you spend each month, get reminded 7 days before a payment is due, and archive anything you stop paying for so you can restart it later.

## Features

- **Category first, then app.** Pick a category, then choose the app from a dropdown (or type your own).
- **Automatic due dates.** Enter when you last paid and how often you pay (every week, month, 3 months or year). The next payment date is calculated for you, and month-end dates don't drift (Jan 31 becomes Feb 28, then Mar 31).
- **Reminders 7 days ahead.** Amber from 7 to 4 days before a payment, red for the last 3 days.
- **Monthly cost.** Totals per currency, counting active subscriptions only (USD, EUR, GBP, KES).
- **Archive and restart.** Archive an app to stop billing and reminders. Restart it later with a new last-paid date, cycle and amount.

## Architecture

```
browser ──► frontend (nginx) ──/api──► backend (FastAPI) ──► db (PostgreSQL)
            serves the React build      runs as a limited         data in a Docker
            and proxies /api            database login            volume
```

| Tier | Tech | Container |
| --- | --- | --- |
| Web | React + Vite, served by nginx | `frontend` |
| App | Python, FastAPI | `backend`, plus a one-shot `migrate` job |
| Data | PostgreSQL 16 | `db` |

## Run it with Docker (recommended)

You need Docker with the Compose plugin and `make`.

```bash
git clone git@github.com:teqeva/Subscription-Tracker.git
cd Subscription-Tracker
make up
```

`make up` runs `./up.sh`, which asks for two passwords and then builds and starts everything:

| Prompt | What it is for |
| --- | --- |
| Database OWNER password | Used only by the migration job, which creates tables |
| API (app login) password | Used by the API. This login can read and write rows but cannot change the schema |

Then open **http://localhost:8080**.

Port 8080 already in use? Pick another with a one-line `.env` file, then run `make up` again:

```bash
echo "WEB_PORT=8081" > .env
```

### Passwords

- Passwords are **never stored in a file**. `up.sh` asks for them in the terminal, hides what you type, and passes them to Docker for that one command. Docker mounts each as a secret file only in the containers that need it.
- On the **first run** each password is asked twice, to catch typos. On later runs it is asked once.
- PostgreSQL stores the passwords when it first creates the database. After that you must type the **same** passwords every time. To start over with new ones, run `make reset` (this deletes the data).
- To skip the prompts, set the variables for a single command, for example from a password manager:

  ```bash
  POSTGRES_PASSWORD="$(pass show renewals/owner)" \
  APP_DB_PASSWORD="$(pass show renewals/app)" ./up.sh
  ```

### Commands

| Command | What it does |
| --- | --- |
| `make up` | Ask for the passwords, build and start everything |
| `make ps` | Show the services and whether they are healthy |
| `make logs` | Follow the logs of all services |
| `make psql` | Open a SQL prompt in the database (as the owner) |
| `make down` | Stop everything, keeping your data |
| `make reset` | **Delete the database volume** and stop everything |

A healthy start looks like this: `db`, `backend` and `frontend` healthy, and `migrate` exited with code 0. Check the API with:

```bash
curl localhost:8080/api/readyz    # {"status":"ready"}
```

### Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `password authentication failed for user "renewals"` | The password differs from the one used on the first run. Retype it, or `make reset` and start again |
| `address already in use` on port 8080 | Something else uses it. Set `WEB_PORT` in `.env` (see above) |
| `Permission denied` on `/app/app/...` while building | Fix file permissions: `chmod -R a+rX backend/app backend/migrations` |
| `migrate` failed | Run `docker compose logs migrate` |
| A service is `unhealthy` | Run `docker compose logs <service>` |

## Run it without Docker

You need Python 3, Node.js and PostgreSQL.

```bash
# Database (Ubuntu/Debian)
sudo apt install -y postgresql
sudo -u postgres psql -c "CREATE USER renewals WITH PASSWORD 'change-me-locally';"
sudo -u postgres psql -c "CREATE DATABASE renewals OWNER renewals;"

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # set the DB_* values for your database
python -m app.migrate
pytest
uvicorn app.main:app --port 8001 --reload

# Frontend (second terminal)
cd frontend
npm install
BACKEND_URL=http://localhost:8001 npm run dev       # http://localhost:5173
```

## Project structure

```
SubTracker/
├── docker-compose.yml      # the four services, secrets and healthchecks
├── up.sh                   # asks for passwords, then starts the stack
├── Makefile                # shortcuts: up, down, logs, ps, psql, reset
├── .env.example            # optional, non-secret settings (no passwords)
├── db/
│   ├── Dockerfile          # Postgres image with the init script baked in
│   └── init/01-app-role.sh # first start only: creates the limited API login
├── backend/
│   ├── Dockerfile          # multi-stage build, runs as a non-root user
│   ├── entrypoint.sh       # reads the password from the mounted secret file
│   ├── app/                # main, logic, schemas, config, db, migrate
│   ├── migrations/001_init.sql
│   └── tests/test_logic.py
└── frontend/
    ├── Dockerfile          # build with Node, serve with unprivileged nginx
    ├── nginx.conf          # serves the app, proxies /api to the backend
    └── src/                # App.jsx, api.js, logos.js, styles.css
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/subscriptions` | Add a subscription |
| GET | `/subscriptions` | List all subscriptions |
| PATCH | `/subscriptions/{id}` | Change status: `active`, `paused` or `cancelled` |
| GET | `/summary` | Monthly totals per currency and renewals due in the next 7 days |
| GET | `/healthz` | Liveness check |
| GET | `/readyz` | Readiness check (verifies the database) |

In Docker, call them under `/api`, for example `/api/summary`. Errors come back as `{"error": {"message": "..."}}`. Money is stored in minor units (cents), for example `4599` for $45.99.

## How it works

- **Archive** sets a subscription's status to `cancelled`. **Restart** creates a fresh active subscription with the new dates, because the backend can only change a status. The archived copy stays in the database and the UI hides it.
- An overdue active subscription rolls forward to its next future date when it is read, so no background job is needed. The database keeps the original date.
- **Migrations** run as a separate one-shot container before the API starts, and the API starts only if they succeed.
- Supported billing cycles: weekly, monthly, every 3 months, yearly.

## Security notes

- The API connects to PostgreSQL as a limited login. It can read and write rows, but it cannot create, alter or drop tables. Only the migration job uses the owner login.
- The database port is not published. Only the other containers can reach it.
- Containers run as non-root users with all Linux capabilities dropped.
- **There is no user login in the app.** Anyone who can reach the web page sees the same data. This suits a personal tool on your own machine. Add authentication or restrict access before exposing it to the internet.
- Never commit `.env`. Only `.env.example` belongs in the repository.

## Roadmap

- Edit a subscription in place (restart without creating a copy)
- More billing cycles (every 2 weeks, every 6 months)
- Email or phone notifications when a payment is due
- Deploy to AWS: images in ECR, database on RDS, services on ECS
