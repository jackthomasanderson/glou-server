#!/usr/bin/env bash
# #673: the API image started Node as a child of `sh -c`, so the stop signal
# Docker sends to PID 1 never reached Node: the graceful shutdown handler
# (ISSUE_091) did not run and Docker killed the container after its 10 s
# grace period. Checked on the real image of the E2E stack: `docker compose
# stop api` must return well under that grace period, and the API log must
# show the graceful shutdown message.
#
# Usage, with the E2E stack up (run last: it stops the API):
#   bash e2e/check-graceful-shutdown.sh
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
export COMPOSE_FILE="$root/docker-compose.e2e.yml"

start=$(date +%s)
docker compose stop -t 10 api
elapsed=$(( $(date +%s) - start ))
echo "docker compose stop api took ${elapsed}s"

if ! docker compose logs api | grep -q 'SIGTERM received, shutting down gracefully'; then
  echo "The API did not log its graceful shutdown: SIGTERM did not reach Node."
  docker compose logs --tail=20 api
  exit 1
fi
[ "$elapsed" -lt 8 ] || { echo "Stopping the API took ${elapsed}s: Docker had to kill it."; exit 1; }
echo "Graceful shutdown OK."
