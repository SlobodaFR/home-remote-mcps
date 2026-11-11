FROM python:3.12-slim

WORKDIR /app

# git is needed only to pip-install the fork-pinned cookidoo-api commit in
# requirements.txt (miaucl/cookidoo-api#238 isn't on PyPI yet) - dropped
# again once pip is done so it doesn't linger in the runtime image.
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app

# Dedicated non-root user with a real, writable HOME: library caches and
# tempfiles (e.g. Python's tempfile in /tmp, anything under ~/) keep working.
RUN useradd --system --uid 1000 --create-home --home-dir /home/app app
USER app

# Internal-only service: no public port mapping in docker-compose, reached
# by the backend over the docker network by service name.
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
