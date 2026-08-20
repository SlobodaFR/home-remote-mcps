#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/remote-mcps}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-remote-mcps}"
GARMIN_CONNECTOR_IMAGE="${GARMIN_CONNECTOR_IMAGE:-ghcr.io/slobodafr/home-remote-mcps-garmin-connector}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG
export GARMIN_CONNECTOR_IMAGE

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq caddy
fi

sudo mkdir -p /etc/caddy/sites
sudo cp "$DEPLOY_DIR/deploy/Caddyfile" /etc/caddy/sites/home-remote-mcps.Caddyfile

if ! grep -q '^import sites/\*$' /etc/caddy/Caddyfile 2>/dev/null; then
  echo 'import sites/*' | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi

sudo caddy validate --config /etc/caddy/Caddyfile

sudo systemctl reload caddy
