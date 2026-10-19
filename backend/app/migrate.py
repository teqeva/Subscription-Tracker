"""Apply SQL files in migrations/ once each. Run as a one-off task: python -m app.migrate"""
import logging
from pathlib import Path

import psycopg

from .config import get_settings
from .logging_setup import setup_logging

log = logging.getLogger("migrate")
MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    with psycopg.connect(settings.conninfo, connect_timeout=30) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(727274)")  # one migrator at a time
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())")
        done = {r[0] for r in conn.execute("SELECT name FROM schema_migrations")}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done:
                continue
            log.info("applying %s", path.name)
            conn.execute(path.read_text())
            conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
        log.info("migrations up to date")


if __name__ == "__main__":
    main()
