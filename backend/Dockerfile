# ============================================================
# NutriSnap Backend — Multi-stage Dockerfile
# ============================================================

# ── Stage 1: dependency builder ──────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools needed for some native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only dependency manifests first (better layer caching)
COPY requirements.txt pyproject.toml ./

# Install all dependencies into a dedicated prefix so we can
# copy just that layer into the final image
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime image ───────────────────────────────────
FROM python:3.12-slim AS runtime

LABEL maintainer="NutriSnap Team"
LABEL description="NutriSnap Backend API"

# Non-root user for security
RUN groupadd -r nutrisnap && useradd -r -g nutrisnap nutrisnap

WORKDIR /app

# Runtime-only system libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY --chown=nutrisnap:nutrisnap app/             ./app/
COPY --chown=nutrisnap:nutrisnap gunicorn_conf.py  ./
COPY --chown=nutrisnap:nutrisnap pyproject.toml    ./
# Root-level modules that are imported directly by app packages
COPY --chown=nutrisnap:nutrisnap analytics_ai.py     ./
COPY --chown=nutrisnap:nutrisnap nutrition_targets.py ./

# Install the project in editable mode (registers entry-points)
RUN pip install --no-cache-dir -e . --no-deps

# Switch to non-root user
USER nutrisnap

# Expose API port
EXPOSE 8000

# Healthcheck — Docker/Compose will mark the container healthy
# only after the app has started and /health returns 200.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Override gunicorn bind so it listens on all interfaces inside the container
ENV GUNICORN_BIND=0.0.0.0:8000

# Default: production server (gunicorn + uvicorn workers via gunicorn_conf.py)
# Override CMD for dev: ["uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
CMD ["gunicorn", "app.main:app", "-c", "gunicorn_conf.py"]
