#!/usr/bin/env bash
# ============================================================
# NutriSnap — Local test runner
#
# Spins up a throwaway Postgres in Docker, starts the FastAPI
# server against it, runs the test suite, then tears everything
# down.
#
# Usage:
#   ./tests/run_local.sh               # non-AI tests only
#   ./tests/run_local.sh --ai          # include @pytest.mark.ai
#   ./tests/run_local.sh tests/backend/test_06_meal_log.py
#   ./tests/run_local.sh tests/backend/test_22_bio_impact.py --ai
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.test.yml"
ENV_FILE="$PROJECT_ROOT/backend/.env.test"
API_PORT=8001
SERVER_PID=""

# ── helpers ──────────────────────────────────────────────────────

log()  { echo "▶  $*"; }
fail() { echo "✗  $*" >&2; exit 1; }

cleanup() {
    log "Tearing down..."
    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" && wait "$SERVER_PID" 2>/dev/null || true
        log "API server stopped (pid $SERVER_PID)"
    fi
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    log "Docker DB stopped"
}
trap cleanup EXIT

# ── 1. Start Docker DB ────────────────────────────────────────────

log "Starting test DB (Docker)..."
docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for Postgres to be healthy..."
for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T db_test \
        pg_isready -U nutrisnap_test -d nutrisnap_test -q 2>/dev/null; then
        log "Postgres is ready (${i}s)"
        break
    fi
    if [[ $i -eq 30 ]]; then
        fail "Postgres did not become healthy in 30 seconds"
    fi
    sleep 1
done

# ── 2. Start FastAPI server ───────────────────────────────────────

log "Starting FastAPI server on port $API_PORT..."
cd "$PROJECT_ROOT/backend"

# Load .env.test but let the real OPENAI_API_KEY through from the parent
# environment (or backend/.env) if not set in .env.test
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

# Pull OPENAI_API_KEY from backend/.env if still unset (needed for --ai tests)
if [[ -z "${OPENAI_API_KEY:-}" ]] && [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
    OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' "$PROJECT_ROOT/backend/.env" | cut -d= -f2- | tr -d '"' | tr -d "'")
    export OPENAI_API_KEY
fi

# Activate venv if present
if [[ -f "nutrisnap/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source nutrisnap/bin/activate
fi

uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$API_PORT" \
    --log-level warning \
    > /tmp/nutrisnap_test_server.log 2>&1 &
SERVER_PID=$!

log "Waiting for API server (pid $SERVER_PID)..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
        log "API server is ready (${i}s)"
        break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "--- server log ---"
        cat /tmp/nutrisnap_test_server.log
        fail "API server crashed during startup"
    fi
    if [[ $i -eq 30 ]]; then
        echo "--- server log ---"
        cat /tmp/nutrisnap_test_server.log
        fail "API server did not become ready in 30 seconds"
    fi
    sleep 1
done

cd "$PROJECT_ROOT"

# ── 3. Run tests ──────────────────────────────────────────────────

# Parse arguments
TEST_PATTERN="tests/backend/"
MARKER_ARGS=(-m "not ai")
AI_MODE=false

for arg in "$@"; do
    case "$arg" in
        --ai)      MARKER_ARGS=(); AI_MODE=true ;;
        --no-ai)   MARKER_ARGS=(-m "not ai") ;;
        *)         TEST_PATTERN="$arg" ;;
    esac
done

if $AI_MODE; then
    log "Running ALL tests (including @pytest.mark.ai — will call OpenAI)"
else
    log "Running non-AI tests (pass --ai to include AI tests)"
fi
log "Test pattern: $TEST_PATTERN"
log "API:  http://localhost:$API_PORT"
log "DB:   postgresql://nutrisnap_test:***@localhost:5435/nutrisnap_test"
echo ""

export TEST_LOCAL_DB=true
export TEST_BASE_URL="http://localhost:$API_PORT"
export TEST_ADMIN_API_KEY="ns-admin-k3y-local-test"

# Activate venv in case we changed directories
if [[ -f "$PROJECT_ROOT/backend/nutrisnap/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/backend/nutrisnap/bin/activate"
fi

python -m pytest "$TEST_PATTERN" -v --tb=short "${MARKER_ARGS[@]+"${MARKER_ARGS[@]}"}"

echo ""
log "Tests complete!"
