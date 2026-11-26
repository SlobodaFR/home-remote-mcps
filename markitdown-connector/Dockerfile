FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non root (uid/gid 1000, comme l'utilisateur node du backend). Aucun volume : /tmp et le HOME suffisent.
RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid 1000 --create-home --home-dir /home/app --shell /usr/sbin/nologin app
USER app

# Internal-only service: no public port mapping in docker-compose, reached
# by the backend over the docker network by service name.
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
