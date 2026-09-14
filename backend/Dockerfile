# Build the frontend, which the Flask app below serves as static files.
FROM node:20-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim

# Pinned deliberately: uv treats a minor bump as breaking, so this should only
# move as a reviewed change.
COPY --from=ghcr.io/astral-sh/uv:0.12.9 /uv /usr/local/bin/uv

ENV SERVER_PATH /backend
ENV FRONTEND_DIRECTORY /frontend-dist

# Install into the system interpreter rather than a .venv: docker-compose mounts
# ./backend over /backend, which would hide a virtualenv created there. This also
# keeps gunicorn on PATH for the compose command.
ENV UV_PROJECT_ENVIRONMENT /usr/local

RUN mkdir -p $SERVER_PATH

WORKDIR $SERVER_PATH

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY --from=frontend /frontend/dist $FRONTEND_DIRECTORY

CMD gunicorn -b 0.0.0.0:8000 --access-logfile - --worker-class gthread --workers 1 --threads 8 "entrypoint:create_app()"
