SHELL := /bin/sh
.DEFAULT_GOAL := help

PNPM ?= pnpm
DOCKER_COMPOSE ?= docker compose

.PHONY: help install approve-builds typecheck lint test build quality check \
	dev dev-server dev-client \
	start stop restart logs ps config \
	docker-build docker-up docker-down docker-restart docker-logs docker-ps docker-config \
	clean reset reset-hard

help: ## Show all available commands
	@awk 'BEGIN {FS = ":.*##"; printf "\nRetailSync Make Targets\n\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2} END {printf "\n"}' $(MAKEFILE_LIST)

install: ## Install workspace dependencies
	$(PNPM) install

approve-builds: ## Approve pnpm build scripts (esbuild, mongodb-memory-server, etc.)
	$(PNPM) approve-builds

typecheck: ## Run TypeScript checks across all packages
	$(PNPM) typecheck

lint: ## Run lint (tsc --noEmit) across all packages
	$(PNPM) lint

test: ## Run test suites across all packages
	$(PNPM) test

build: ## Build all packages
	$(PNPM) build

quality: ## Run typecheck + lint
	$(PNPM) typecheck
	$(PNPM) lint

check: ## Run quality + test + build (full local CI)
	$(PNPM) typecheck
	$(PNPM) lint
	$(PNPM) test
	$(PNPM) build

dev: ## Start server + client locally (pnpm dev)
	$(PNPM) dev

dev-server: ## Start only server in watch mode
	$(PNPM) --filter @retailsync/server dev

dev-client: ## Start only client in watch mode
	$(PNPM) --filter @retailsync/client dev

start: docker-up ## Start full stack with Docker (mongo + server + client)

stop: docker-down ## Stop Docker stack

restart: docker-restart ## Restart Docker stack

logs: docker-logs ## Follow Docker logs

ps: docker-ps ## Show Docker services status

config: docker-config ## Show resolved Docker Compose config

docker-build: ## Build Docker images (server + client)
	$(DOCKER_COMPOSE) build --progress plain server client

docker-up: ## Build and start Docker stack in detached mode
	$(DOCKER_COMPOSE) up --build -d

docker-down: ## Stop and remove Docker stack (keeps volumes)
	$(DOCKER_COMPOSE) down --remove-orphans

docker-restart: ## Restart Docker stack
	$(DOCKER_COMPOSE) down --remove-orphans
	$(DOCKER_COMPOSE) up --build -d

docker-logs: ## Tail Docker logs for all services
	$(DOCKER_COMPOSE) logs -f --tail=200

docker-ps: ## Show Docker services status
	$(DOCKER_COMPOSE) ps

docker-config: ## Print resolved Docker Compose config
	$(DOCKER_COMPOSE) config

clean: ## Remove build artifacts and TS build metadata
	rm -rf client/dist server/dist shared/dist
	find . -name "*.tsbuildinfo" -type f -delete

reset: ## Stop Docker, remove volumes, and clean build artifacts
	$(DOCKER_COMPOSE) down -v --remove-orphans
	rm -rf client/dist server/dist shared/dist
	find . -name "*.tsbuildinfo" -type f -delete

reset-hard: ## Full reset: reset + remove node_modules and pnpm store (requires reinstall)
	$(DOCKER_COMPOSE) down -v --remove-orphans
	rm -rf node_modules .pnpm-store client/node_modules server/node_modules shared/node_modules
	rm -rf client/dist server/dist shared/dist
	find . -name "*.tsbuildinfo" -type f -delete

