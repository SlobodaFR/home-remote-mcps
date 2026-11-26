#!/bin/sh
set -e

DEPLOY_DIR="${DEPLOY_DIR:-/opt/remote-mcps}"
IMAGE="${IMAGE:-ghcr.io/slobodafr/home-remote-mcps}"
GARMIN_CONNECTOR_IMAGE="${GARMIN_CONNECTOR_IMAGE:-ghcr.io/slobodafr/home-remote-mcps-garmin-connector}"
COOKIDOO_CONNECTOR_IMAGE="${COOKIDOO_CONNECTOR_IMAGE:-ghcr.io/slobodafr/home-remote-mcps-cookidoo-connector}"
MARKITDOWN_CONNECTOR_IMAGE="${MARKITDOWN_CONNECTOR_IMAGE:-ghcr.io/slobodafr/home-remote-mcps-markitdown-connector}"

cd "$DEPLOY_DIR/deploy"

export IMAGE
export IMAGE_TAG
export GARMIN_CONNECTOR_IMAGE
export COOKIDOO_CONNECTOR_IMAGE
export MARKITDOWN_CONNECTOR_IMAGE

# Images are public - no login needed to pull. Drop any stale/invalid
# cached credential for ghcr.io first: docker prefers a cached credential
# over anonymous access, so a leftover bad one from an earlier failed
# login would keep blocking pulls of an otherwise-public image.
docker logout ghcr.io >/dev/null 2>&1 || true

# Convention harnais image-retention : fait de la place AVANT le pull (garde keep-1 images par dépôt).
sh "$DEPLOY_DIR/deploy/scripts/prune-service-images.sh" --phase pre \
  --service remote-mcps --image "$IMAGE" --image "$GARMIN_CONNECTOR_IMAGE" --image "$COOKIDOO_CONNECTOR_IMAGE" --image "$MARKITDOWN_CONNECTOR_IMAGE" \
  --tag "$IMAGE_TAG" --project home-remote-mcps
docker compose pull
# Convention harnais docker-nonroot-volume : l'image tourne en uid 1000 mais le volume de donnees existant appartient a root
# (cree par l'ancienne image). Le service est arrete puis le volume rendu a 1000:1000, avant le `up`. Idempotent.
# ORDRE (non verifie par l'audit) : la sauvegarde pre-deploy-backup tourne AVANT ce script (deploy-vps.yml, sous le meme
# verrou d'hote) ; ne jamais deplacer ce chown avant elle, ni apres compose-up-healthy.sh. `set -e` : pas de `||`.
sh "$DEPLOY_DIR/deploy/scripts/fix-volume-owner.sh" --service remote-mcps \
  --project home-remote-mcps --volume home-remote-mcps-data --stop home-remote-mcps
# Convention harnais deploy-wait-healthy : `docker compose up -d --wait` (repli : boucle docker inspect) ; un conteneur
# qui n'est pas sain après 180 s fait échouer le déploiement (logs, sauvegarde et restauration affichées), sans retour arrière automatique.
sh "$DEPLOY_DIR/deploy/scripts/compose-up-healthy.sh" --service remote-mcps \
  --restore-args "--project home-remote-mcps --volume home-remote-mcps-data --mount /app/backend/data --db-path ${DATABASE_PATH:-/app/backend/data/home-remote-mcps.sqlite}" \
  -- --remove-orphans
# Convention harnais image-retention : après un déploiement sain uniquement (set -e), garde 2 images par dépôt.
sh "$DEPLOY_DIR/deploy/scripts/prune-service-images.sh" --phase post \
  --service remote-mcps --image "$IMAGE" --image "$GARMIN_CONNECTOR_IMAGE" --image "$COOKIDOO_CONNECTOR_IMAGE" --image "$MARKITDOWN_CONNECTOR_IMAGE" \
  --tag "$IMAGE_TAG" --project home-remote-mcps

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
