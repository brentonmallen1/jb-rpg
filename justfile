# J&B's RPG development commands

# Default: show available commands
default:
    @just --list

# Install dependencies
install:
    uv sync

# Install with dev dependencies
install-dev:
    uv sync --group dev

# Run the development server
dev:
    uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests
test:
    uv run pytest

# Run tests with verbose output
test-v:
    uv run pytest -v

# Clean session state (removes state.json)
clean-state:
    rm -f state.json

# Clean all generated files
clean:
    rm -f state.json
    find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true

# Open the app in the default browser
open:
    open http://localhost:8000
