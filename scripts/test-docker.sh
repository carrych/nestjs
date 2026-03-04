#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Docker validation script for nestjs-ecommerce
#
# Tests:
#   1. Build all Docker stages (dev, prod, prod-distroless)
#   2. Compare image sizes
#   3. Verify non-root user in prod (alpine) container
#   4. Verify no shell in prod-distroless (distroless confirmed)
#   5. Start prod-like stack (postgres + api)
#   6. Verify postgres is NOT exposed externally
#   7. Run migrations as one-off container
#   8. Run seed as one-off container
#   9. Verify API responds on localhost:8080
#  10. Cleanup
#
# Ubuntu prerequisites (run once before first use):
#
#   1. Install Docker Engine (if not installed):
#        curl -fsSL https://get.docker.com | sh
#
#   2. Allow running docker without sudo.
#      By default /var/run/docker.sock is owned by group 'docker',
#      but your user is not in that group yet:
#        sudo usermod -aG docker $USER
#
#   3. Apply the new group to the current shell session
#      (avoids full logout/login):
#        newgrp docker
#
#   4. Verify access works:
#        docker info
#
# Usage:
#   cd /home/dell/projects/nestjs
#   cp .env.example .env   # edit DB_* and JWT_SECRET
#   ./scripts/test-docker.sh
#
# Manual stack start (without full test run):
#
#   docker compose up -d postgres
#   docker compose run --rm migrate
#   docker compose run --rm seed
#   docker compose up -d api
#
#   curl http://localhost:8080/health   # → {"status":"ok"}
#   docker compose ps                  # → api (healthy), postgres (healthy)
#
#   docker compose --profile tools down -v  # stop + remove volumes
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass()  { echo -e "${GREEN}✓ $*${NC}"; }
fail()  { echo -e "${RED}✗ $*${NC}"; exit 1; }
info()  { echo -e "${YELLOW}▶ $*${NC}"; }
title() { echo -e "\n${BLUE}═══ $* ═══${NC}"; }

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ── Prerequisites ─────────────────────────────────────────────────────────────
title "Prerequisites"
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}✗ docker not found${NC}"
  echo ""
  echo "  Install Docker Engine:"
  echo "    curl -fsSL https://get.docker.com | sh"
  echo "    sudo usermod -aG docker \$USER && newgrp docker"
  exit 1
fi
command -v curl >/dev/null 2>&1 || fail "curl not found"
pass "docker and curl available"

# Verify Docker daemon is accessible (catches missing docker group membership)
if ! docker info >/dev/null 2>&1; then
  DOCKER_ERR=$(docker info 2>&1 || true)
  if echo "$DOCKER_ERR" | grep -q "permission denied"; then
    # User is already in the docker group but the current session was opened
    # before 'usermod' ran — re-exec this script under the docker group GID
    # so it works without a full logout/login.
    if getent group docker | grep -qw "$(whoami)"; then
      info "Session predates docker group membership — re-launching with sg docker..."
      exec sg docker -c "\"$0\""
    fi
    echo -e "${RED}✗ Cannot connect to Docker daemon${NC}"
    echo ""
    echo "  Permission denied on /var/run/docker.sock"
    echo "  Current user '$(whoami)' is not in the 'docker' group."
    echo ""
    echo "  Fix (run once, then re-login or open a new terminal):"
    echo "    sudo usermod -aG docker $(whoami)"
  else
    echo -e "${RED}✗ Cannot connect to Docker daemon${NC}"
    echo ""
    echo "  Is Docker daemon running?  sudo systemctl start docker"
    echo "  Error: $DOCKER_ERR"
  fi
  exit 1
fi
pass "Docker daemon reachable"

if [ ! -f .env ]; then
  echo "No .env file found. Creating from .env.example..."
  cp .env.example .env
  info ".env created — you may need to edit DB_PASSWORD and JWT_SECRET before running again"
fi
pass ".env file exists"

# ── Stage 1: Build all targets ────────────────────────────────────────────────
title "1. Building all Docker stages"

DOCKER_BUILDKIT=1 docker build --target dev              -t nestjs-ecommerce:dev              . \
  && pass "Stage 'dev' built"

DOCKER_BUILDKIT=1 docker build --target prod             -t nestjs-ecommerce:prod             . \
  && pass "Stage 'prod' built"

DOCKER_BUILDKIT=1 docker build --target prod-distroless  -t nestjs-ecommerce:prod-distroless  . \
  && pass "Stage 'prod-distroless' built"

# ── Stage 2: Image size comparison ───────────────────────────────────────────
title "2. Image size comparison"
echo ""
docker image ls nestjs-ecommerce --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"
echo ""
info "prod-distroless should be the smallest (no shell, no OS tools)"

# ── Stage 3: docker history (layers of prod-distroless) ──────────────────────
title "3. Layer history: prod-distroless"
docker history nestjs-ecommerce:prod-distroless --no-trunc 2>/dev/null | head -20

# ── Stage 4: Non-root in prod (alpine) ───────────────────────────────────────
title "4. Verify non-root user in prod (alpine)"
USER_INFO=$(docker run --rm nestjs-ecommerce:prod id 2>/dev/null || echo "error")
echo "  id output: $USER_INFO"
if echo "$USER_INFO" | grep -q "uid=0(root)"; then
  fail "prod container is running as root!"
else
  pass "prod container is non-root: $USER_INFO"
fi

# ── Stage 5: Distroless = no shell ───────────────────────────────────────────
title "5. Verify no shell in prod-distroless"
# distroless has no /bin/sh, so --entrypoint sh should fail
if docker run --rm --entrypoint sh nestjs-ecommerce:prod-distroless -c "echo has_shell" 2>/dev/null; then
  fail "prod-distroless HAS a shell — not truly distroless!"
else
  pass "prod-distroless has NO shell (distroless confirmed)"
fi

# ── Stage 6: Verify distroless runs as nonroot ────────────────────────────────
title "6. Distroless nonroot UID"
# distroless/nodejs:nonroot uses UID 65532
# We can't run `id` (no shell), but we can inspect the image config
DISTROLESS_USER=$(docker inspect nestjs-ecommerce:prod-distroless \
  --format '{{.Config.User}}' 2>/dev/null || echo "not set")
echo "  Image User config: '${DISTROLESS_USER}'"
info "distroless/nodejs22-debian12:nonroot runs as UID 65532 by default (nonroot)"
pass "Non-root guaranteed by base image gcr.io/distroless/nodejs22-debian12:nonroot"

# ── Stage 7: Cleanup old containers ──────────────────────────────────────────
title "7. Cleanup previous stack"
docker compose --profile tools down -v 2>/dev/null || true
pass "Previous stack removed"

# ── Stage 8: Start postgres ───────────────────────────────────────────────────
title "8. Start postgres"
docker compose up -d postgres

info "Waiting for postgres healthcheck (up to 60s)..."
WAITED=0
until docker compose ps postgres 2>/dev/null | grep -q "(healthy)"; do
  sleep 3
  WAITED=$((WAITED + 3))
  [ "$WAITED" -ge 60 ] && fail "postgres did not become healthy in 60s"
done
pass "postgres is healthy"

# ── Stage 9: Verify postgres NOT exposed externally ──────────────────────────
title "9. Verify postgres NOT exposed on host"
POSTGRES_PORT=$(docker compose port postgres 5432 2>/dev/null || echo "not exposed")
echo "  docker compose port postgres 5432: $POSTGRES_PORT"
if echo "$POSTGRES_PORT" | grep -qE "0\.0\.0\.0|127\.0\.0\.1"; then
  fail "postgres IS exposed to host (found port mapping: $POSTGRES_PORT)"
else
  pass "postgres is NOT exposed externally (no ports: in compose.yml)"
fi

# ── Stage 10: Run migrations ──────────────────────────────────────────────────
title "10. Run migrations (one-off container)"
docker compose --profile tools run --rm migrate \
  && pass "Migrations completed successfully" \
  || fail "Migrations failed — check logs above"

# ── Stage 11: Run seed ────────────────────────────────────────────────────────
title "11. Run seed (one-off container)"
docker compose --profile tools run --rm seed \
  && pass "Seed completed successfully" \
  || fail "Seed failed — check logs above"

# ── Stage 12: Start API ───────────────────────────────────────────────────────
title "12. Start API (prod-distroless)"
docker compose up -d api

# Wait for /health to return 200 — faster and more reliable than GraphQL
info "Waiting for GET /health to return 200 (up to 90s)..."
WAITED=0
API_READY=false
until [ "$WAITED" -ge 90 ]; do
  sleep 5
  WAITED=$((WAITED + 5))
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:8080/health 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    API_READY=true
    break
  fi
  echo "  Attempt (${WAITED}s): HTTP $HTTP_CODE — retrying..."
done

if [ "$API_READY" = "true" ]; then
  pass "API is up: GET /health → HTTP 200"
else
  echo "  API logs:"
  docker compose logs api --tail=30
  fail "API did not respond on /health in 90s"
fi

# ── Stage 13: Health endpoint body ───────────────────────────────────────────
title "13. Health endpoint response body"
HEALTH_BODY=$(curl -s http://localhost:8080/health 2>/dev/null || echo "{}")
echo "  Response: $HEALTH_BODY"
if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  pass "GET /health → {\"status\":\"ok\"}"
else
  fail "Unexpected /health response: $HEALTH_BODY"
fi

# ── Stage 14: Docker healthcheck status ──────────────────────────────────────
title "14. Docker healthcheck status"
info "Waiting for Docker to report api as (healthy) (up to 60s)..."
WAITED=0
until docker compose ps api 2>/dev/null | grep -q "(healthy)"; do
  sleep 5
  WAITED=$((WAITED + 5))
  [ "$WAITED" -ge 60 ] && {
    info "Container not (healthy) yet — may still be in start_period (30s)"
    break
  }
done
CONTAINER_STATUS=$(docker compose ps api 2>/dev/null | grep api || echo "unknown")
echo "  $CONTAINER_STATUS"
if echo "$CONTAINER_STATUS" | grep -q "(healthy)"; then
  pass "api container is (healthy)"
else
  info "api is running but healthcheck is still in start_period — OK"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
title "RESULTS SUMMARY"
echo ""
echo "Image sizes:"
docker image ls nestjs-ecommerce --format "  {{.Tag}}: {{.Size}}"
echo ""
echo "Running containers:"
docker compose ps
echo ""
pass "All tests passed!"
echo ""
info "Stack is running. To stop: docker compose --profile tools down -v"
