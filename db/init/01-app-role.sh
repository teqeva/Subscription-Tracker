#!/bin/sh
# Runs once, when the database is first created. Creates a LIMITED login for the API.
#
# Two logins now exist:
#   owner (POSTGRES_USER)  creates and changes tables. Only the migrate job uses it.
#   renewals_app           can read and write rows, but cannot create, alter or drop anything.
# If the API ever has a bug that lets an attacker run SQL, the damage is limited to the rows.
set -eu

APP_PW="$(cat /run/secrets/app_db_password)"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v app_pw="$APP_PW" -v owner="$POSTGRES_USER" -v dbname="$POSTGRES_DB" <<'SQL'
-- :'x' puts the value in as a quoted string, :"x" as a quoted name. psql fills them in.
CREATE ROLE renewals_app LOGIN PASSWORD :'app_pw';

GRANT CONNECT ON DATABASE :"dbname" TO renewals_app;
GRANT USAGE ON SCHEMA public TO renewals_app;

-- "Default privileges" apply to tables the owner creates LATER (your migrations),
-- so you never have to remember to grant access when you add a table.
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO renewals_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO renewals_app;
SQL
