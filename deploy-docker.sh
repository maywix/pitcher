#!/usr/bin/env bash

set -euo pipefail

IMAGE_NAME="audio-web"
CONTAINER_NAME="audio-web"
PORT="${1:-8080}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/3] Build de l'image Docker..."
docker build -t "${IMAGE_NAME}" "${SCRIPT_DIR}"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[2/3] Suppression de l'ancien conteneur ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
else
  echo "[2/3] Aucun ancien conteneur à supprimer."
fi

echo "[3/3] Démarrage du conteneur sur le port ${PORT}..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:80" \
  "${IMAGE_NAME}" >/dev/null

echo "Application en ligne: http://localhost:${PORT}"
echo "Depuis une autre machine: http://IP_DE_TA_MACHINE:${PORT}"