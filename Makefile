SHELL := /bin/sh

AWS_PROFILE ?= colony
COMPOSE_DIR := Submission_Incoming_Request_Processing_Workflow
COMPOSE := AWS_PROFILE=$(AWS_PROFILE) docker compose --env-file .env -f docker-compose.yml
SERVICES ?= api sqlite-web
PROFILES ?=

.PHONY: help aws-login auth aws-whoami services choose up up-api up-db up-factory down logs ps build restart shell-api

help:
	@printf '%s\n' 'Conductor container commands'
	@printf '%s\n' ''
	@printf '%s\n' 'AWS:'
	@printf '%s\n' '  make aws-login                 Authenticate aws --profile colony'
	@printf '%s\n' '  make aws-whoami                Verify active AWS identity'
	@printf '%s\n' ''
	@printf '%s\n' 'Run services:'
	@printf '%s\n' '  make up                        Run default services: api sqlite-web'
	@printf '%s\n' '  make up-api                    Run only api'
	@printf '%s\n' '  make up-db                     Run api and sqlite-web'
	@printf '%s\n' '  make up-factory                Run api, sqlite-web, and request-factory profile'
	@printf '%s\n' '  make choose                    Prompt for Compose service(s) to run'
	@printf '%s\n' '  make up SERVICES="api"          Run selected Compose service(s)'
	@printf '%s\n' '  make up PROFILES=factory SERVICES="request-factory"'
	@printf '%s\n' ''
	@printf '%s\n' 'Maintenance:'
	@printf '%s\n' '  make services                  List Compose services'
	@printf '%s\n' '  make logs SERVICES="api"        Tail logs for selected service(s)'
	@printf '%s\n' '  make ps                        Show running containers'
	@printf '%s\n' '  make down                      Stop containers'

aws-login:
	aws sso login --profile $(AWS_PROFILE)
	aws sts get-caller-identity --profile $(AWS_PROFILE)

auth: aws-login

aws-whoami:
	aws sts get-caller-identity --profile $(AWS_PROFILE)

services:
	cd $(COMPOSE_DIR) && $(COMPOSE) config --services

choose: aws-whoami
	@cd $(COMPOSE_DIR) && \
	available="$$(AWS_PROFILE=$(AWS_PROFILE) docker compose --env-file .env -f docker-compose.yml --profile factory config --services | tr '\n' ' ')" && \
	printf '%s\n' "Available services: $$available" && \
	printf '%s' 'Services to run: ' && \
	read services && \
	AWS_PROFILE=$(AWS_PROFILE) docker compose --env-file .env -f docker-compose.yml $(foreach profile,$(PROFILES),--profile $(profile)) up --build $$services

up: aws-whoami
	cd $(COMPOSE_DIR) && $(COMPOSE) $(foreach profile,$(PROFILES),--profile $(profile)) up --build $(SERVICES)

up-api: aws-whoami
	cd $(COMPOSE_DIR) && $(COMPOSE) up --build api

up-db: aws-whoami
	cd $(COMPOSE_DIR) && $(COMPOSE) up --build api sqlite-web

up-factory: aws-whoami
	cd $(COMPOSE_DIR) && $(COMPOSE) --profile factory up --build api sqlite-web request-factory

down:
	cd $(COMPOSE_DIR) && $(COMPOSE) $(foreach profile,$(PROFILES),--profile $(profile)) down

logs:
	cd $(COMPOSE_DIR) && $(COMPOSE) logs -f $(SERVICES)

ps:
	cd $(COMPOSE_DIR) && $(COMPOSE) ps

build: aws-whoami
	cd $(COMPOSE_DIR) && $(COMPOSE) $(foreach profile,$(PROFILES),--profile $(profile)) build $(SERVICES)

restart: down up

shell-api:
	cd $(COMPOSE_DIR) && $(COMPOSE) exec api sh
