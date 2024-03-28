FROM python:3.11-slim

RUN apt-get update && apt-get install -qq -y \
    build-essential libpq-dev --no-install-recommends

ENV SERVER_PATH /backend
RUN mkdir -p $SERVER_PATH

WORKDIR $SERVER_PATH

COPY requirements.txt requirements.txt
RUN pip install -r requirements.txt

# COPY . .
# RUN pip install --editable .

CMD gunicorn -b 0.0.0.0:8000 --access-logfile - "api.app:create_app()"
