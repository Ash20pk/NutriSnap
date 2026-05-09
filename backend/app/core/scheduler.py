"""
Background scheduler — replaces both Supabase edge function cron jobs and adds
weekly nutrient cleanup.

Jobs (all UTC):
  analytics_warmup  — daily 21:30 UTC (~3am IST)  — pre-warm week analytics for active users
  nutrient_daily    — daily 20:00 UTC (~1:30am IST) — quick USDA/AI fill for new/missing foods
  nutrient_weekly   — Sunday 22:30 UTC (~4am IST Mon) — full nutrient fix + meal recalculation
"""

import asyncio
import fcntl
import logging
import sys
from pathlib import Path
from typing import IO

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None
_lock_file: IO | None = None
_LOCK_PATH = Path("/tmp/nutrisnap_scheduler.lock")

# Absolute path to the backend root — works both locally and in Docker (/app)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


# ---------------------------------------------------------------------------
# Job: analytics warmup
# ---------------------------------------------------------------------------

async def job_analytics_warmup() -> None:
    """Pre-warm week analytics cache for users who logged meals in the last 7 days."""
    from app.db.pool import get_pool
    from app.services.analytics_service import AnalyticsService

    logger.info("[CRON analytics_warmup] Starting")
    pool = get_pool()
    service = AnalyticsService(pool)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT user_id::text
            FROM meals
            WHERE timestamp >= now() - interval '7 days'
            """
        )

    user_ids = [r["user_id"] for r in rows]
    logger.info("[CRON analytics_warmup] %d active users to warm", len(user_ids))

    success = failed = skipped = 0
    for uid in user_ids:
        try:
            result = await service.refresh_analytics(uid, "week", 0)
            if result.get("meals_analyzed", 0) == 0:
                skipped += 1
            else:
                success += 1
        except Exception as exc:
            logger.warning("[CRON analytics_warmup] user=%s error=%s", uid, exc)
            failed += 1
        await asyncio.sleep(1.0)  # pace OpenAI calls — ~1 req/s

    logger.info(
        "[CRON analytics_warmup] done success=%d skipped=%d failed=%d",
        success, skipped, failed,
    )


# ---------------------------------------------------------------------------
# Job: nutrient backfill (subprocess helper)
# ---------------------------------------------------------------------------

async def _run_backfill(*extra_args: str) -> None:
    """Run backfill_nutrients.py as a subprocess, inheriting env vars from the parent."""
    script = _BACKEND_ROOT / "backfill_nutrients.py"
    cmd = [sys.executable, str(script), *extra_args]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(_BACKEND_ROOT),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        output = (stdout or b"").decode(errors="replace").strip()
        tail = "\n".join(output.splitlines()[-15:])
        if proc.returncode == 0:
            logger.info("[CRON backfill] exit=0\n%s", tail)
        else:
            logger.error("[CRON backfill] exit=%d\n%s", proc.returncode, output[-2000:])
    except Exception as exc:
        logger.error("[CRON backfill] failed to launch: %s", exc, exc_info=True)


async def job_nutrient_daily() -> None:
    """
    Daily pass: enrich up to 30 unverified/broken foods. No meal recalc (fast).
    Covers new user-created foods within 24h of being logged.
    """
    logger.info("[CRON nutrient_daily] Starting")
    await _run_backfill(
        "--filter", "needs-work",   # bad macros OR missing micros OR verified=false
        "--mode", "fix-suspicious",
        "--batch-size", "30",
        "--skip-meals",
    )
    logger.info("[CRON nutrient_daily] Done")


async def job_nutrient_weekly() -> None:
    """
    Full weekly cleanup: fix all foods with bad/missing data, verify unverified foods,
    then recalculate every meal that references an updated food.
    """
    logger.info("[CRON nutrient_weekly] Starting")
    await _run_backfill(
        "--filter", "needs-work",   # picks up everything: broken + unverified
        "--mode", "fix-suspicious",
        # no --batch-size: process everything
        # no --skip-meals: runs Phase 2 meal recalculation
    )
    logger.info("[CRON nutrient_weekly] Done")


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

def start() -> None:
    global _scheduler, _lock_file

    if _scheduler and _scheduler.running:
        return

    # Acquire an exclusive non-blocking lock so only one gunicorn worker runs the scheduler.
    # The OS releases the lock automatically when the worker process exits.
    try:
        _lock_file = open(_LOCK_PATH, "w")
        fcntl.flock(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        if _lock_file:
            _lock_file.close()
            _lock_file = None
        logger.info("[CRON] Scheduler already claimed by another worker — skipping")
        return

    _scheduler = AsyncIOScheduler(timezone="UTC")

    # Analytics warmup — daily 21:30 UTC (~3am IST)
    _scheduler.add_job(
        job_analytics_warmup,
        CronTrigger(hour=21, minute=30, timezone="UTC"),
        id="analytics_warmup",
        name="Analytics cache warmup",
        max_instances=1,
        misfire_grace_time=3600,
        coalesce=True,
    )

    # Nutrient daily — 20:00 UTC (~1:30am IST) — fast, skips meal recalc
    _scheduler.add_job(
        job_nutrient_daily,
        CronTrigger(hour=20, minute=0, timezone="UTC"),
        id="nutrient_daily",
        name="Nutrient daily fill",
        max_instances=1,
        misfire_grace_time=3600,
        coalesce=True,
    )

    # Nutrient weekly — Sunday 22:30 UTC (~4am IST Mon)
    _scheduler.add_job(
        job_nutrient_weekly,
        CronTrigger(day_of_week="sun", hour=22, minute=30, timezone="UTC"),
        id="nutrient_weekly",
        name="Weekly nutrient cleanup + meal recalculation",
        max_instances=1,
        misfire_grace_time=7200,
        coalesce=True,
    )

    _scheduler.start()
    logger.info(
        "[CRON] Scheduler started — jobs: analytics_warmup(daily 21:30), "
        "nutrient_daily(daily 20:00), nutrient_weekly(Sun 22:30)"
    )


def stop() -> None:
    global _scheduler, _lock_file
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[CRON] Scheduler stopped")
    if _lock_file:
        try:
            fcntl.flock(_lock_file, fcntl.LOCK_UN)
            _lock_file.close()
        except Exception:
            pass
        _lock_file = None
