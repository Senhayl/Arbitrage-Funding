SHELL := /bin/zsh

PYTHON ?= python3
VENV_DIR ?= .venv
VENV_PY := $(VENV_DIR)/bin/python
VENV_PIP := $(VENV_DIR)/bin/pip
UVICORN := $(VENV_PY) -m uvicorn

BACKEND_HOST ?= 127.0.0.1
BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5173

.PHONY: help venv install-backend install-frontend install run-backend run-frontend run build-frontend check-backend clean

help:
	@echo "Targets disponibles:"
	@echo "  make venv            -> cree l'environnement Python (.venv)"
	@echo "  make install-backend -> installe les deps Python"
	@echo "  make install-frontend-> installe les deps Node"
	@echo "  make install         -> installe backend + frontend"
	@echo "  make run-backend     -> lance l'API FastAPI en local"
	@echo "  make run-frontend    -> lance Vite en local"
	@echo "  make run             -> lance backend + frontend ensemble"
	@echo "  make build-frontend  -> build de production frontend"
	@echo "  make check-backend   -> test rapide GET /health"

venv:
	@if [ ! -d "$(VENV_DIR)" ]; then \
		$(PYTHON) -m venv $(VENV_DIR); \
		echo "Environnement cree: $(VENV_DIR)"; \
	else \
		echo "Environnement deja present: $(VENV_DIR)"; \
	fi

install-backend: venv
	@$(VENV_PIP) install --upgrade pip
	@$(VENV_PIP) install -r requirements_v2.txt

install-frontend:
	@npm install

install: install-backend install-frontend

run-backend: venv
	@$(UVICORN) server:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

run-frontend:
	@npm run dev -- --host $(BACKEND_HOST) --port $(FRONTEND_PORT)

run:
	@trap 'kill 0' INT TERM EXIT; \
	$(UVICORN) server:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT) & \
	npm run dev -- --host $(BACKEND_HOST) --port $(FRONTEND_PORT) & \
	wait

build-frontend:
	@npm run build

check-backend:
	@curl -sS http://$(BACKEND_HOST):$(BACKEND_PORT)/health

clean:
	@rm -rf $(VENV_DIR)
	@echo "Supprime: $(VENV_DIR)"