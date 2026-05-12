"""
Admin routes for managing label submissions and reviews.
"""

from datetime import timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.admin_service import AdminService
from app.db.pool import get_pool
from app.core.config import settings
from app.core import scheduler as _scheduler_module

router = APIRouter(prefix="/admin", tags=["admin"])


def get_admin_service() -> AdminService:
    """Dependency to get admin service instance."""
    pool = get_pool()
    return AdminService(pool)


def verify_admin_key(admin_key: str = Header(None, alias="X-Admin-Key")) -> str:
    """Verify admin API key."""
    if not admin_key or admin_key != settings.ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return admin_key


# Pydantic models
class ApproveLabelReviewRequest(BaseModel):
    submission_id: str
    action: str  # 'approve' or 'reject'
    admin_id: str
    notes: Optional[str] = None


@router.get("/label-reviews")
async def list_label_reviews(
    status: str = "pending",
    limit: int = 50,
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    List food label submissions for review.
    
    Args:
        status: Filter by status (pending, approved, rejected)
        limit: Maximum number of results
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with submissions list and count
    """
    return await service.list_label_reviews(status, limit)


@router.post("/label-reviews/action")
async def approve_label_review(
    payload: ApproveLabelReviewRequest,
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    Approve or reject a label submission.
    
    Args:
        payload: Review action request
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with updated submission status
    """
    return await service.approve_label_review(
        submission_id=payload.submission_id,
        admin_id=payload.admin_id,
        action=payload.action,
        admin_notes=payload.notes
    )


def _scheduler_lock_held() -> bool:
    """Try to grab the lock non-blocking. If it fails, another worker holds it = scheduler is active."""
    import fcntl
    lock_path = _scheduler_module._LOCK_PATH
    if not lock_path.exists():
        return False
    try:
        with open(lock_path, "r") as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(f, fcntl.LOCK_UN)
            return False  # got the lock — nobody holds it
    except OSError:
        return True  # another process holds it = scheduler is running


@router.get("/cron/status")
async def get_cron_status(admin_key: str = Depends(verify_admin_key)):
    """
    Return scheduler state and next fire times.
    Works correctly regardless of which gunicorn worker handles the request:
    - scheduler_active: true if ANY worker holds the lock (reliable cross-worker check)
    - this_worker: true only if THIS worker is the scheduler worker
    - jobs: populated only when this_worker=true
    """
    sched = _scheduler_module._scheduler
    is_this_worker = sched is not None and sched.running
    active = is_this_worker or _scheduler_lock_held()

    jobs = []
    if is_this_worker:
        for job in sched.get_jobs():
            next_run = job.next_run_time
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_utc": next_run.astimezone(timezone.utc).isoformat() if next_run else None,
            })

    return {
        "scheduler_active": active,
        "this_worker": is_this_worker,
        "note": "Hit this endpoint a few times if this_worker=false — jobs shown only from the scheduler worker",
        "jobs": jobs,
    }


_VALID_JOBS = {
    "analytics_warmup": _scheduler_module.job_analytics_warmup,
    "nutrient_daily":   _scheduler_module.job_nutrient_daily,
    "nutrient_weekly":  _scheduler_module.job_nutrient_weekly,
    "diet_report_weekly": _scheduler_module.job_diet_report_weekly,
    "diet_report_monthly": _scheduler_module.job_diet_report_monthly,
    "diet_report_yearly": _scheduler_module.job_diet_report_yearly,
}


@router.post("/cron/trigger/{job_id}")
async def trigger_cron_job(job_id: str, admin_key: str = Depends(verify_admin_key)):
    """
    Manually fire a cron job right now for testing.
    Runs directly on whichever worker receives the request — no need to hit the
    scheduler worker specifically. The job runs in the background so the response
    returns immediately.
    """
    import asyncio

    fn = _VALID_JOBS.get(job_id)
    if fn is None:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown job '{job_id}'. Valid: {list(_VALID_JOBS)}"
        )

    asyncio.create_task(fn())
    return {"triggered": job_id, "message": "Job started in background — check docker logs for progress"}


@router.get("/stats")
async def get_admin_stats(
    admin_key: str = Depends(verify_admin_key),
    service: AdminService = Depends(get_admin_service)
):
    """
    Get admin dashboard statistics.
    
    Args:
        admin_key: Admin API key (from header)
        service: Admin service instance
    
    Returns:
        Dictionary with various admin stats
    """
    return await service.get_admin_stats()
