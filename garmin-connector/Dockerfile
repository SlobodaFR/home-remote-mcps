FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Dedicated non-root user with a real, writable HOME: library caches and
# tempfiles (e.g. Python's tempfile in /tmp, anything under ~/) keep working.
RUN useradd --system --uid 1000 --create-home --home-dir /home/app app
USER app

# Internal-only service: no public port mapping in docker-compose, reached
# by the backend over the docker network by service name.
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
