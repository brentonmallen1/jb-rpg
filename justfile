# J&B's RPG development commands

set dotenv-load

# Default ports (can be overridden via env)
backend_port := env_var_or_default("BACKEND_PORT", "8000")
frontend_port := env_var_or_default("FRONTEND_PORT", "5173")


# Default: show available commands
default:
    @just --list

# Install all dependencies (backend + frontend)
install:
    uv sync
    cd frontend && npm install

# Install with dev dependencies
install-dev:
    uv sync --group dev
    cd frontend && npm install

# Run backend server (FastAPI)
backend:
    uv run uvicorn main:app --reload --timeout-graceful-shutdown 2 --host 0.0.0.0 --port {{backend_port}}

# Run frontend dev server (Vite)
frontend-dev:
    cd frontend && FRONTEND_PORT={{frontend_port}} BACKEND_PORT={{backend_port}} npm run dev

# Build frontend for production
frontend-build:
    cd frontend && npm run build

# Run both backend and frontend dev servers
dev:
    @echo "Starting backend on http://localhost:{{backend_port}} and frontend on http://localhost:{{frontend_port}}"
    uv run uvicorn main:app --reload --timeout-graceful-shutdown 2 --host 0.0.0.0 --port {{backend_port}} & \
    cd frontend && BACKEND_PORT={{backend_port}} FRONTEND_PORT={{frontend_port}} npm run dev

# Run tests
test:
    uv run pytest

# Run tests with verbose output
test-v:
    uv run pytest -v

# Clean session state (removes the active session)
clean-state:
    rm -f data/state.json

# Clean all generated files
clean:
    rm -f data/state.json
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
    rm -rf frontend/dist 2>/dev/null || true

# Open the app in the default browser (frontend dev server)
open:
    open http://localhost:{{frontend_port}}

# Build and run with Docker
docker-up:
    docker compose up --build

# Stop Docker containers
docker-down:
    docker compose down

# Registry URL for releases
registry_url := env_var_or_default("REGISTRY_URL", "")

# Build and push Docker image to registry (linux/amd64)
release tag="latest":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{registry_url}}" ]; then
        echo "Error: REGISTRY_URL not set in .env"
        exit 1
    fi
    image="{{registry_url}}/jb-rpg:{{tag}}"
    echo "Building and pushing $image..."
    docker buildx build \
        --platform linux/amd64 \
        -t "$image" \
        --push \
        .
    echo "Released: $image"
