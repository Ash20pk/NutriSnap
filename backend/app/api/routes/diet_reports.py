"""
Diet report API routes.

Provides endpoints for fetching diet reports for users.
"""

from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.services.diet_report_service import DietReportService
from app.db.pool import get_pool
from app.api.dependencies import get_current_uid

router = APIRouter(prefix="/diet-reports", tags=["diet-reports"])


def get_diet_report_service() -> DietReportService:
    """Dependency to get diet report service instance."""
    pool = get_pool()
    return DietReportService(pool)


@router.get("/latest")
async def get_latest_report(
    time_range: str = Query("week", description="Time range: week, month, or year"),
    uid: str = Depends(get_current_uid),
    service: DietReportService = Depends(get_diet_report_service),
):
    """
    Get the latest diet report for the current user.
    
    Args:
        time_range: Time range for the report (week, month, or year)
        current_user: Current authenticated user
        service: Diet report service instance
    
    Returns:
        Latest diet report or 404 if not found
    """
    if time_range not in ["week", "month", "year"]:
        raise HTTPException(status_code=400, detail="Invalid time_range. Must be 'week', 'month', or 'year'")
    
    report = await service.get_latest_report(uid, time_range)
    
    if not report:
        raise HTTPException(status_code=404, detail="No report found for this time range")
    
    return report
