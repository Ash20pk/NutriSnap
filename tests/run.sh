#!/bin/bash
# Run NutriSnap E2E tests using uv
# Usage: ./tests/run.sh [test_file_pattern] [--all | --ai]
#   ./tests/run.sh                          → all backend tests, skip AI
#   ./tests/run.sh tests/backend/test_01*   → single file
#   ./tests/run.sh tests/backend/ --all     → include AI tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env from tests/.env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "Loading environment from tests/.env"
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Check for uv
if ! command -v uv &> /dev/null; then
    echo "uv not found. Installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

cd "$PROJECT_ROOT"

# Test path (first argument, default to all backend tests)
TEST_PATTERN="${1:-tests/backend/}"

# Build marker args using an array to avoid quoting issues
MARKER_ARGS=()
if [ "${2}" = "--all" ]; then
    echo "Running ALL tests (including AI)"
elif [ "${2}" = "--ai" ]; then
    MARKER_ARGS=(-m "ai")
    echo "Running AI tests only"
else
    MARKER_ARGS=(-m "not ai")
    echo "Skipping AI tests (pass --all to include them)"
fi

echo "Running tests: $TEST_PATTERN"
echo "Backend URL:   ${TEST_BASE_URL:-NOT SET — export TEST_BASE_URL first}"
echo ""

# Run with uv
uv run \
    --with pytest \
    --with httpx \
    --with pytest-asyncio \
    --with supabase \
    --with python-dotenv \
    pytest "$TEST_PATTERN" -v --tb=short "${MARKER_ARGS[@]}"

echo ""
echo "Tests complete!"
