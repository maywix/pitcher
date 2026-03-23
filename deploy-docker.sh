#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-8080}"
IMAGE_NAME="pitcher-pro"
CONTAINER_NAME="pitcher-pro"

echo "[1/5] Remove old image ${IMAGE_NAME} (if exists)..."
docker image rm -f "${IMAGE_NAME}" >/dev/null 2>&1 || true

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[2/5] Remove old container ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
else
  echo "[2/5] No old container found."
fi

echo "[3/5] Build image ${IMAGE_NAME} (no cache)..."
docker build --pull --no-cache -t "${IMAGE_NAME}" .

echo "[4/5] Start container on port ${PORT}..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:80" \
  "${IMAGE_NAME}" >/dev/null

echo "[5/5] Done."
echo "Local URL:    http://localhost:${PORT}"
echo "Network URL:  http://<SERVER_IP>:${PORT}"
echo "Status check: docker ps --filter 'name=${CONTAINER_NAME}'"