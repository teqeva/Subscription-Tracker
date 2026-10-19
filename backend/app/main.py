import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import make_pool
from .logging_setup import setup_logging
from .logic import roll_forward, summarize
from .schemas import StatusUpdate, SubscriptionIn

log = logging.getLogger("renewals")

COLUMNS = "id, name, amount_minor, currency, billing_cycle, next_due_date, category, status, last_billed_date"


def today_utc():
    return datetime.now(timezone.utc).date()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    setup_logging(settings.log_level)
    app.state.pool = make_pool(settings)
    log.info("started")
    yield
    app.state.pool.close()  # uvicorn finishes in-flight requests on SIGTERM, then we land here
    log.info("stopped")


app = FastAPI(title="Renewals API", lifespan=lifespan)


# ---- consistent error shape: {"error": {"message": "..."}} ----
@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse({"error": {"message": str(exc.detail)}}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0]
    field = str(first["loc"][-1]) if first["loc"] else "request"
    return JSONResponse({"error": {"message": f"{field}: {first['msg']}"}}, status_code=422)


def present(row: dict, today) -> dict:
    """Overdue active subscriptions show their next future due date."""
    out = dict(row)
    if out["status"] == "active":
        out["next_due_date"] = roll_forward(out["next_due_date"], out["billing_cycle"], today)
    return out


# ---- operational endpoints ----
@app.get("/healthz")
def healthz():
    return {"status": "ok"}  # liveness: the process is up


@app.get("/readyz")
def readyz(request: Request):
    try:
        with request.app.state.pool.connection() as conn:
            conn.execute("SELECT 1")
    except Exception:
        log.exception("readiness check failed")
        raise HTTPException(503, "database unavailable")
    return {"status": "ready"}


# ---- the app ----
@app.post("/subscriptions", status_code=201)
def create_subscription(sub: SubscriptionIn, request: Request):
    with request.app.state.pool.connection() as conn:
        row = conn.execute(
            f"""INSERT INTO subscriptions
                  (name, amount_minor, currency, billing_cycle, next_due_date, category, status, last_billed_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {COLUMNS}""",
            (sub.name, sub.amount_minor, sub.currency, sub.billing_cycle, sub.next_due_date,
             sub.category, sub.status, sub.last_billed_date),
        ).fetchone()
    return present(row, today_utc())


@app.get("/subscriptions")
def list_subscriptions(request: Request):
    with request.app.state.pool.connection() as conn:
        rows = conn.execute(f"SELECT {COLUMNS} FROM subscriptions ORDER BY next_due_date, name").fetchall()
    today = today_utc()
    return [present(r, today) for r in rows]


@app.patch("/subscriptions/{sub_id}")
def update_status(sub_id: int, body: StatusUpdate, request: Request):
    with request.app.state.pool.connection() as conn:
        row = conn.execute(
            f"UPDATE subscriptions SET status = %s WHERE id = %s RETURNING {COLUMNS}", (body.status, sub_id)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Subscription not found")
    return present(row, today_utc())


@app.get("/summary")
def get_summary(request: Request):
    with request.app.state.pool.connection() as conn:
        rows = conn.execute(f"SELECT {COLUMNS} FROM subscriptions WHERE status = 'active'").fetchall()
    return summarize(rows, today_utc())
