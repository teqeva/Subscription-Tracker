# Renewals (SubTracker)

A personal subscription tracker. Add the apps and services you pay for, see what you spend each month, get reminded 7 days before a payment is due, and archive anything you stop paying for so you can restart it later.

## Features

- **Category first, then app.** Pick a category, then choose the app from a dropdown (or type your own).
- **Automatic due dates.** Enter when you last paid and how often you pay (every week, month, 3 months or year). The next payment date is calculated for you, and month-end dates don't drift (Jan 31 becomes Feb 28, then Mar 31).
- **Reminders 7 days ahead.** Amber from 7 to 4 days before a payment, red for the last 3 days.
- **Monthly cost.** Totals per currency, counting active subscriptions only (USD, EUR, GBP, KES).
- **Archive and restart.** Archive an app to stop billing and reminders. Restart it later with a new last-paid date, cycle and amount.

## Tech stack

| Part | Tech |
| --- | --- |
| Frontend | React + Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |

## Project structure

```
SubTracker/
├── frontend/
│   └── src/
│       ├── App.jsx        # UI: form, reminders, subscription lists
│       ├── api.js         # calls to the backend (/api/...)
│       ├── logos.js       # brand logos (simple-icons)
│       ├── main.jsx
│       └── styles.css
└── backend/
    ├── app/
    │   ├── main.py        # API routes
    │   ├── logic.py       # business rules, no database code
    │   ├── schemas.py     # request/response models
    │   ├── config.py      # settings from environment variables
    │   ├── db.py
    │   ├── logging_setup.py
    │   └── migrate.py     # applies the SQL migrations
    ├── migrations/001_init.sql
    ├── tests/test_logic.py
    ├── requirements.txt
    ├── requirements-dev.txt
    └── .env.example
```

## Run it locally

You need Python 3, Node.js and PostgreSQL.

### 1. Database

Install PostgreSQL and create a user and database (Ubuntu/Debian):

```bash
sudo apt update && sudo apt install -y postgresql
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE USER renewals WITH PASSWORD 'change-me-locally';"
sudo -u postgres psql -c "CREATE DATABASE renewals OWNER renewals;"
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # then set the DB_* values to match your database
python -m app.migrate         # creates the tables
pytest                        # runs the logic tests
uvicorn app.main:app --port 8001 --reload
```

Check it works:

```bash
curl localhost:8001/readyz    # {"status":"ready"}
```

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8001 npm run dev
```

Open http://localhost:5173.

The frontend calls the backend through a relative `/api` path, and Vite proxies it to `BACKEND_URL`. If the page shows "Could not load your data: Not Found", the proxy is pointing at the wrong port. Restart Vite with the command above.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/subscriptions` | Add a subscription |
| GET | `/subscriptions` | List all subscriptions |
| PATCH | `/subscriptions/{id}` | Change status: `active`, `paused` or `cancelled` |
| GET | `/summary` | Monthly totals per currency and renewals due in the next 7 days |
| GET | `/healthz` | Liveness check |
| GET | `/readyz` | Readiness check (verifies the database) |

Errors come back as `{"error": {"message": "..."}}`. Money is stored in minor units (cents), for example `4599` for $45.99.

## How it works

- **Archive** sets a subscription's status to `cancelled`.
- **Restart** creates a fresh active subscription with the new dates. The backend can only change a status, so the archived copy stays in the database and the UI hides it.
- An overdue active subscription rolls forward to its next future date when it is read, so no background job is needed. The database keeps the original date.
- Supported billing cycles: weekly, monthly, every 3 months, yearly. Other cycles (for example every 2 weeks or every 6 months) need a backend change.

## Notes

- **No login.** Anyone who can reach the API sees the same data. This suits a personal tool. When deploying, restrict access to your own IP or add authentication first.
- Never commit `.env`. Only `.env.example` belongs in the repository.

## Roadmap

- Edit a subscription in place (restart without creating a copy)
- More billing cycles
- Email or phone notifications when a payment is due
- Dockerfiles and a Compose file
- Deploy to AWS (the health endpoints are ready for an ALB and ECS)
