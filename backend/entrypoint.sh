#!/bin/sh
# Container start-up helper: the "_FILE" convention.
# Instead of handing the password to the app as an environment variable (visible in
# "docker inspect"), Compose mounts it as a file. This script reads that file into DB_PASSWORD
# for the app process only, then starts the real command.
set -eu

if [ -z "${DB_PASSWORD:-}" ] && [ -n "${DB_PASSWORD_FILE:-}" ]; then
    DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"
    export DB_PASSWORD
fi

exec "$@"
