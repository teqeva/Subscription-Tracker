#!/usr/bin/env bash
# Start the stack. The passwords are typed here and live only inside this script's process:
#   - not written to any file
#   - not saved in your shell history (read -s hides them and keeps them out of history)
#   - not left behind in your terminal (the variables disappear when the script ends)
#
# Already have them in a password manager? Set them for one command and the prompts are skipped:
#   POSTGRES_PASSWORD="$(pass show renewals/owner)" APP_DB_PASSWORD="$(pass show renewals/app)" ./up.sh
set -euo pipefail
cd "$(dirname "$0")"

ask() {   # ask VARIABLE_NAME "Prompt text"
    local name="$1" prompt="$2"
    if [ -z "${!name:-}" ]; then
        read -rsp "$prompt: " "$name"
        echo
        if [ -z "${!name}" ]; then
            echo "The password can't be empty." >&2
            exit 1
        fi
    fi
    export "$name"
}

ask POSTGRES_PASSWORD "Database OWNER password"
ask APP_DB_PASSWORD   "API (app login) password"

exec docker compose up --build -d "$@"
