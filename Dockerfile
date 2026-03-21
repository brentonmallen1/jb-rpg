# Stage 1: Build frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python app
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

ENV BACKEND_PORT=8000
ENV DATA_DIR=/data
ENV PYTHONUNBUFFERED=1

# Admin authentication (set via docker-compose or runtime)
ENV ADMIN_USER=""
ENV ADMIN_PASSWORD=""
ENV AUTH_DISABLED="false"
ENV BASE_URL=""

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable
COPY main.py ./

# Copy built frontend to static directory
COPY --from=frontend-builder /app/frontend/dist ./static

# Copy demo stories into the data directory
COPY data/stories/demo-*.json /data/stories/

EXPOSE ${BACKEND_PORT}
CMD uv run uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT}
