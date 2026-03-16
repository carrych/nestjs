#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-start.sh — start the full development stack
#
# What it does:
#   1. Checks prerequisites (docker, yarn, .env)
#   2. Starts PostgreSQL + RabbitMQ via Docker Compose
#   3. Waits for both to be healthy
#   4. Runs DB migrations (if not yet applied)
#   5. Starts payments-grpc server in background  (port 50051)
#   6. Starts orders API in foreground             (port 3000)
#   7. On Ctrl+C — shuts down the payments-grpc process cleanly
#
# Usage:
#   cd /path/to/nestjs
#   cp .env.example .env   # edit DB_PASSWORD and JWT_SECRET
#   ./scripts/dev-start.sh
#
# RabbitMQ Management UI:
#   http://localhost:15672   login: guest / guest
#   (queues appear after the API connects for the first time)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

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

PAYMENTS_GRPC_PID=""

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down..."
  if [ -n "$PAYMENTS_GRPC_PID" ] && kill -0 "$PAYMENTS_GRPC_PID" 2>/dev/null; then
    kill "$PAYMENTS_GRPC_PID" 2>/dev/null || true
    pass "payments-grpc stopped (PID $PAYMENTS_GRPC_PID)"
  fi
  info "Docker services still running. To stop them:"
  echo "  docker compose down"
}
trap cleanup EXIT INT TERM

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
title "1. Prerequisites"

command -v docker >/dev/null 2>&1 || fail "docker not found — install Docker Engine"
command -v yarn   >/dev/null 2>&1 || fail "yarn not found — run: npm install -g yarn"

if ! docker info >/dev/null 2>&1; then
  if getent group docker | grep -qw "$(whoami)" 2>/dev/null; then
    info "Session predates docker group — re-launching with sg docker..."
    exec sg docker -c "\"$0\""
  fi
  fail "Cannot connect to Docker daemon. Run: sudo systemctl start docker"
fi
pass "docker and yarn available"

if [ ! -f .env ]; then
  info ".env not found — copying from .env.example"
  cp .env.example .env
  info "Edit .env and set DB_PASSWORD + JWT_SECRET, then re-run this script"
  exit 1
fi
pass ".env file exists"

# ── 2. Free ports ────────────────────────────────────────────────────────────
title "2. Free ports"
GRPC_PORT="${PAYMENTS_GRPC_PORT:-50051}"
GRPC_PID=$(lsof -ti:"$GRPC_PORT" 2>/dev/null || true)
if [ -n "$GRPC_PID" ]; then
  kill -9 "$GRPC_PID" 2>/dev/null || true
  # Wait until the port is actually released (up to 10s)
  WAITED=0
  while lsof -ti:"$GRPC_PORT" >/dev/null 2>&1; do
    sleep 1; WAITED=$((WAITED + 1))
    [ "$WAITED" -ge 10 ] && fail "Port $GRPC_PORT not released after 10s"
  done
  pass "Killed stale process on port $GRPC_PORT (PID $GRPC_PID)"
else
  pass "Port $GRPC_PORT is free"
fi

# ── 3. Start Docker services ──────────────────────────────────────────────────
title "3. Start PostgreSQL + RabbitMQ"
docker compose up -d postgres rabbitmq
pass "Containers started"

# ── 3. Wait for postgres ──────────────────────────────────────────────────────
title "4. Wait for PostgreSQL"
info "Waiting for postgres healthcheck (up to 60s)..."
WAITED=0
until docker compose ps postgres 2>/dev/null | grep -q "(healthy)"; do
  sleep 3; WAITED=$((WAITED + 3))
  [ "$WAITED" -ge 60 ] && fail "postgres did not become healthy in 60s"
done
pass "postgres is healthy"

# ── 4. Wait for RabbitMQ ──────────────────────────────────────────────────────
title "5. Wait for RabbitMQ"
info "Waiting for rabbitmq healthcheck (up to 60s)..."
WAITED=0
until docker compose ps rabbitmq 2>/dev/null | grep -q "(healthy)"; do
  sleep 3; WAITED=$((WAITED + 3))
  [ "$WAITED" -ge 60 ] && fail "rabbitmq did not become healthy in 60s"
done
pass "rabbitmq is healthy"
info "Management UI → http://localhost:15672  (guest / guest)"

# ── 5. Run migrations ─────────────────────────────────────────────────────────
title "6. Run DB migrations"
yarn migration:run && pass "Migrations applied" || fail "Migrations failed"

# ── 6. Start payments-grpc in background ─────────────────────────────────────
title "7. Start payments-grpc server (background)"
PAYMENTS_GRPC_PORT="${PAYMENTS_GRPC_PORT:-50051}"
info "Starting payments-grpc on port $PAYMENTS_GRPC_PORT..."

yarn start:payments-grpc &
PAYMENTS_GRPC_PID=$!

# Give it 3s to boot and fail fast if it crashes immediately
sleep 3
if ! kill -0 "$PAYMENTS_GRPC_PID" 2>/dev/null; then
  fail "payments-grpc failed to start — check logs above"
fi
pass "payments-grpc running (PID $PAYMENTS_GRPC_PID, port $PAYMENTS_GRPC_PORT)"

# ── 7. Start orders API ───────────────────────────────────────────────────────
title "8. Start orders API (foreground)"
echo ""
echo -e "${BLUE}  HTTP API   → http://localhost:3000${NC}"
echo -e "${BLUE}  GraphQL    → http://localhost:3000/graphql${NC}"
echo -e "${BLUE}  RabbitMQ   → http://localhost:15672  (guest / guest)${NC}"
echo -e "${BLUE}  gRPC       → localhost:$PAYMENTS_GRPC_PORT${NC}"
echo ""
info "Press Ctrl+C to stop"
echo ""

yarn start:dev
