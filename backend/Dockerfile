# Build the frontend, which the Flask app below serves as static files.
FROM node:20-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11-slim

ENV SERVER_PATH /backend
ENV FRONTEND_DIRECTORY /frontend-dist
RUN mkdir -p $SERVER_PATH

WORKDIR $SERVER_PATH

COPY backend/requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY --from=frontend /frontend/dist $FRONTEND_DIRECTORY

# COPY . .
# RUN pip install --editable .

CMD gunicorn -b 0.0.0.0:8000 --access-logfile - "entrypoint:create_app()"
