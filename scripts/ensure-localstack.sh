#!/bin/bash
# Ensure LocalStack S3 is running before E2E tests.
# If not running — starts it via docker compose dev override and waits until healthy.

set -e

HEALTH_URL="http://localhost:4566/_localstack/health"
TIMEOUT=30

if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
  echo "LocalStack already running."
  exit 0
fi

echo "LocalStack not running — starting..."
docker compose -f compose.yml -f compose.dev.yml up localstack -d

echo "Waiting for LocalStack to be ready (timeout: ${TIMEOUT}s)..."
elapsed=0
until curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "ERROR: LocalStack did not start within ${TIMEOUT}s" >&2
    exit 1
  fi
  elapsed=$((elapsed + 1))
  sleep 1
done

echo "LocalStack is ready."
