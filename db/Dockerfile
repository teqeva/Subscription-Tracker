# syntax=docker/dockerfile:1
#
# Database image: the official Postgres image plus one thing baked in, the scripts in db/init/.
# Postgres runs every script in /docker-entrypoint-initdb.d/ ONCE, the first time the data volume
# is empty, in alphabetical order. After that they are skipped (the data already exists).
#
# Why not just use the stock image? Because we want the init script (01-app-role.sh) to create a
# limited login for the API, and shipping it inside the image keeps the Compose file simple.
FROM postgres:16-alpine

COPY --chmod=755 init/ /docker-entrypoint-initdb.d/
