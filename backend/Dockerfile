# syntax=docker/dockerfile:1
#
# Backend image: FastAPI app, built in two stages.
#   builder: has compilers, installs the Python packages into a virtualenv.
#   runtime: starts clean, copies only the finished virtualenv and the app code.
# The compilers never reach the final image, so it is smaller and has less to attack.

# ---------- stage 1: builder ----------
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

# Build tools are only needed if a package has to be compiled (for example psycopg2 without "-binary").
# If your requirements.txt uses a "-binary" package, you can delete this whole RUN line.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy ONLY the requirements first. Docker caches each step, so this slow install step is
# re-run only when requirements.txt changes, not every time you edit app code.
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---------- stage 2: runtime ----------
FROM python:3.12-slim AS runtime

# The small shared library Postgres drivers need at run time (no compilers).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Run as a normal user, not root. If someone breaks into the app, they get far less.
RUN useradd --create-home --uid 10001 appuser

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chmod=a+rX app ./app
COPY --chmod=a+rX migrations ./migrations
COPY --chmod=755 entrypoint.sh /entrypoint.sh

USER appuser
EXPOSE 8000

# The entrypoint reads the password from a mounted secret file, then runs CMD (or the
# command Compose gives, such as the migrate job).
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
