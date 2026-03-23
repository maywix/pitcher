#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-8080}"
IMAGE_NAME="pitcher-pro"
CONTAINER_NAME="pitcher-pro"

echo "[1/4] Build image ${IMAGE_NAME}..."
docker build -t "${IMAGE_NAME}" .

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[2/4] Remove old container ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
else
  echo "[2/4] No old container found."
fi

echo "[3/4] Start container on port ${PORT}..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:80" \
  "${IMAGE_NAME}" >/dev/null

echo "[4/4] Done."
echo "Local URL:    http://localhost:${PORT}"
echo "Network URL:  http://<SERVER_IP>:${PORT}"
echo "Status check: docker ps --filter 'name=${CONTAINER_NAME}'"