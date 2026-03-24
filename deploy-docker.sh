#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-8080}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PORT

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose non disponible. Installe docker compose plugin ou docker-compose."
  exit 1
fi

echo "[1/4] Stop anciens services compose..."
$COMPOSE_CMD down --remove-orphans || true

echo "[2/4] Build images sans cache..."
$COMPOSE_CMD build --pull --no-cache

echo "[3/4] Start services..."
$COMPOSE_CMD up -d --force-recreate

echo "[4/4] Done."
echo "Local URL:    http://localhost:${PORT}"
echo "Network URL:  http://<SERVER_IP>:${PORT}"
echo "Status check: $COMPOSE_CMD ps"