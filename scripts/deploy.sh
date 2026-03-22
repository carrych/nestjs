#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/compose.deploy.yml"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "ERROR: environment argument required (stage|prod)" >&2
  exit 1
fi

if [[ "$ENVIRONMENT" != "stage" && "$ENVIRONMENT" != "prod" ]]; then
  echo "ERROR: environment must be 'stage' or 'prod'" >&2
  exit 1
fi

if [[ -z "${DEPLOY_IMAGE:-}" ]]; then
  echo "ERROR: DEPLOY_IMAGE is not set" >&2
  exit 1
fi

echo "deploy=${ENVIRONMENT} image=${DEPLOY_IMAGE} port=${API_PORT}"

docker pull "${DEPLOY_IMAGE}"

docker compose \
  -f "${COMPOSE_FILE}" \
  -p "${COMPOSE_PROJECT_NAME}" \
  up -d postgres rabbitmq

echo "Waiting for postgres..."
for i in $(seq 1 30); do
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT_NAME}" \
    exec -T postgres pg_isready -U "${DB_USER}" -d "${DB_NAME}" \
    > /dev/null 2>&1 && break
  [ "$i" -eq 30 ] && { echo "ERROR: postgres health timeout"; exit 1; }
  sleep 2
done

docker compose \
  --profile tools \
  -f "${COMPOSE_FILE}" \
  -p "${COMPOSE_PROJECT_NAME}" \
  run --rm migrate

docker compose \
  -f "${COMPOSE_FILE}" \
  -p "${COMPOSE_PROJECT_NAME}" \
  up -d --no-build --remove-orphans api

echo "Waiting for API..."
for i in $(seq 1 30); do
  curl -sf "http://localhost:${API_PORT}/health" > /dev/null 2>&1 && break
  [ "$i" -eq 30 ] && { echo "ERROR: API health timeout"; exit 1; }
  sleep 3
done

echo "done: ${ENVIRONMENT} deployed (${DEPLOY_IMAGE})"
