.PHONY: help install install-dev install-prod run run-prod test lint format clean \
        docker-build docker-up docker-dev docker-down docker-logs docker-shell docker-clean

help:
	@echo "NutriSnap Backend - Available commands:"
	@echo ""
	@echo "  Local development:"
	@echo "    make install       - Install package in editable mode"
	@echo "    make install-dev   - Install with dev dependencies"
	@echo "    make install-prod  - Install with production dependencies"
	@echo "    make run           - Run development server (uvicorn --reload)"
	@echo "    make run-prod      - Run production server with gunicorn"
	@echo "    make test          - Run tests"
	@echo "    make lint          - Run linters (flake8, mypy)"
	@echo "    make format        - Format code (black, isort)"
	@echo "    make clean         - Clean build artifacts"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker-build  - Build the API image"
	@echo "    make docker-up     - Start API + DB (production mode)"
	@echo "    make docker-dev    - Start API + DB (hot-reload dev mode)"
	@echo "    make docker-down   - Stop all containers"
	@echo "    make docker-logs   - Tail API container logs"
	@echo "    make docker-shell  - Open a shell inside the API container"
	@echo "    make docker-clean  - Remove containers, volumes, and image"
	@echo ""

install:
	pip install -e .

install-dev:
	pip install -e ".[dev,test]"

install-prod:
	pip install -e ".[prod]"

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run-prod:
	gunicorn app.main:app -c gunicorn_conf.py

test:
	pytest -v

test-cov:
	pytest --cov=app --cov-report=html --cov-report=term

lint:
	flake8 app/ --max-line-length=120
	mypy app/ --ignore-missing-imports

format:
	black app/ tests/
	isort app/ tests/

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf build/ dist/ .pytest_cache/ .mypy_cache/ htmlcov/ .coverage

# ── Docker targets ────────────────────────────────────────────
docker-build:
	docker compose build --no-cache

docker-up:
	docker compose up -d

docker-dev:
	docker compose --profile dev up

docker-down:
	docker compose --profile dev down

docker-logs:
	docker compose logs -f api

docker-shell:
	docker compose exec api /bin/bash

docker-clean:
	docker compose --profile dev down -v --rmi local

.DEFAULT_GOAL := help
