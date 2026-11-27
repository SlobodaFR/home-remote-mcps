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

# Non root (uid/gid 1000, comme l'utilisateur node du backend). Aucun volume : /tmp et le HOME suffisent.
RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/app --shell /usr/sbin/nologin app
# Release identity (convention harnais release-versioning), en fin d'étage final : le cache de build reste valide.
ARG APP_VERSION=dev
ARG APP_COMMIT=dev
ENV APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT
USER app

# Internal-only service: no public port mapping in docker-compose, reached
# by the backend over the docker network by service name.
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
