from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings


def make_pool(settings: Settings) -> ConnectionPool:
    # open(wait=True, timeout=...) retries while the database is still starting up
    pool = ConnectionPool(settings.conninfo, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=False)
    pool.open(wait=True, timeout=30)
    return pool
