# ---------------------------------------------------------------------------
# litsamaiso - repo task runner
#
# Run everything from this directory. No more cd-ing into each package.
#   make install     install deps in api + client
#   make dev         run api + client dev servers together
#   make ship m="..."  stage, commit and push the current branch
#
# Portable between Windows cmd.exe and POSIX sh, so recipes avoid shell
# builtins that only exist on one side.
# ---------------------------------------------------------------------------


API           := litsamaiso-api
CLIENT        := litsamaiso-client
REMOTE        := origin
DEPLOY_BRANCH := develop
REPO_URL      := https://github.com/BU-Innovation-Hub/litsamaiso

# Re-expanded on every use, so it always reflects the branch you are on now.
BRANCH = $(shell git rev-parse --abbrev-ref HEAD)

ifeq ($(OS),Windows_NT)
  # cmd's rmdir rejects forward slashes, so flip them first.
  RMRF  = if exist "$(subst /,\,$(1))" rmdir /s /q "$(subst /,\,$(1))"
  OPEN  = start "" "$(1)"
  BLANK = @echo.
else
  RMRF  = rm -rf "$(1)"
  ifeq ($(shell uname -s),Darwin)
    OPEN = open "$(1)"
  else
    OPEN = xdg-open "$(1)"
  endif
  BLANK = @echo ""
endif

# Fails the recipe (not the whole makefile) when a required var is missing.
require = $(if $($(1)),,$(error Missing $(1). $(2)))

.DEFAULT_GOAL := help

# --- setup -----------------------------------------------------------------

## install: npm install in api and client
install:
	@echo == installing $(API) ==
	cd $(API) && npm install
	@echo == installing $(CLIENT) ==
	cd $(CLIENT) && npm install

## install-api: npm install in the api only
install-api:
	cd $(API) && npm install

## install-client: npm install in the client only
install-client:
	cd $(CLIENT) && npm install

## reinstall: wipe node_modules in both packages, then install
reinstall: clean-deps install

# --- dev -------------------------------------------------------------------

## dev: run api and client dev servers side by side
dev:
	@echo starting api on :5000 and client on :5173 - Ctrl+C stops both
	@$(MAKE) --no-print-directory -j 2 dev-api dev-client

## dev-api: run the api dev server only
dev-api:
	-@cd $(API) && npm run dev

## dev-client: run the client dev server only
dev-client:
	-@cd $(CLIENT) && npm run dev

# --- build / checks --------------------------------------------------------

## build: build api and client
build: build-api build-client

## build-api: tsc build of the api
build-api:
	cd $(API) && npm run build

## build-client: tsc + vite build of the client
build-client:
	cd $(CLIENT) && npm run build

## lint: eslint the client
lint:
	cd $(CLIENT) && npm run lint

## check: build both packages and lint the client
check: build lint

## start: run the compiled api from dist
start:
	cd $(API) && npm start

## preview: serve the built client
preview:
	cd $(CLIENT) && npm run preview

# --- git -------------------------------------------------------------------

## status: short branch + working tree status
status:
	@git status -sb

## ship: stage all, commit and push the current branch. make ship m="feat: x"
ship:
	@$(call require,m,Usage: make ship m="feat: your message")
	@echo == branch $(BRANCH) ==
	git add -A
	git commit -m "$(m)"
	git push -u $(REMOTE) $(BRANCH)

## save: stage all and commit without pushing. make save m="wip: x"
save:
	@$(call require,m,Usage: make save m="wip: your message")
	git add -A
	git commit -m "$(m)"

## push: push the current branch to origin
push:
	git push -u $(REMOTE) $(BRANCH)

## sync: fetch origin and merge origin/develop into the current branch
sync:
	git fetch $(REMOTE)
	git merge $(REMOTE)/$(DEPLOY_BRANCH)

## pr: open the GitHub compare page for the current branch into develop
pr:
	@echo opening compare page for $(BRANCH) into $(DEPLOY_BRANCH)
	@$(call OPEN,$(REPO_URL)/compare/$(DEPLOY_BRANCH)...$(BRANCH)?expand=1)

# --- cleanup ---------------------------------------------------------------

## clean: remove build output from both packages
clean:
	@$(call RMRF,$(API)/dist)
	@$(call RMRF,$(CLIENT)/dist)
	@echo build output removed

## clean-deps: remove node_modules from both packages
clean-deps:
	@$(call RMRF,$(API)/node_modules)
	@$(call RMRF,$(CLIENT)/node_modules)
	@echo node_modules removed

# --- help ------------------------------------------------------------------

## help: list the available targets
help:
	@echo litsamaiso - available targets
	$(BLANK)
	@echo   setup
	@echo     make install          npm install in api and client
	@echo     make install-api      npm install in the api only
	@echo     make install-client   npm install in the client only
	@echo     make reinstall        wipe node_modules, then install
	$(BLANK)
	@echo   dev
	@echo     make dev              api on :5000 and client on :5173 together
	@echo     make dev-api          api dev server only
	@echo     make dev-client       client dev server only
	$(BLANK)
	@echo   build and checks
	@echo     make build            build api and client
	@echo     make lint             eslint the client
	@echo     make check            build both, then lint
	@echo     make start            run the compiled api
	@echo     make preview          serve the built client
	$(BLANK)
	@echo   git
	@echo     make status           short status for the current branch
	@echo     make ship m="msg"     stage, commit and push the current branch
	@echo     make save m="msg"     stage and commit, no push
	@echo     make push             push the current branch
	@echo     make sync             merge origin/develop into this branch
	@echo     make pr               open the PR compare page into develop
	$(BLANK)
	@echo   cleanup
	@echo     make clean            remove dist output
	@echo     make clean-deps       remove node_modules

.PHONY: install install-api install-client reinstall \
        dev dev-api dev-client \
        build build-api build-client lint check start preview \
        status ship save push sync pr \
        clean clean-deps help
