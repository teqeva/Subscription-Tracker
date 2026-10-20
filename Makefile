# Shortcuts so you don't have to remember the long commands.  Usage: make up, make logs, ...
# (Makefile recipe lines must start with a TAB, not spaces.)

.PHONY: up down logs ps psql reset

up:        ## ask for the passwords, then build and start everything in the background
	./up.sh

down:      ## stop everything (your data is kept)
	docker compose down

logs:      ## follow the logs of all services
	docker compose logs -f

ps:        ## show what is running and whether it is healthy
	docker compose ps

psql:      ## open a SQL prompt inside the database (as the owner)
	docker compose exec db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

reset:     ## DANGER: stop everything and delete the database volume (needed after changing passwords)
	docker compose down -v
