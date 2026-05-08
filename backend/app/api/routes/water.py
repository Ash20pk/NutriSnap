"""Water intake tracking routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.dependencies import get_current_uid
from app.db.pool import get_pool
from app.services.water_service import WaterService

router = APIRouter(prefix="/water", tags=["water"])


def get_water_service() -> WaterService:
    return WaterService(get_pool())


class WaterLogRequest(BaseModel):
    user_id: str
    amount_ml: int


class WaterGoalRequest(BaseModel):
    user_id: str
    goal_ml: int


@router.post("/log")
async def log_water(
    body: WaterLogRequest,
    uid: str = Depends(get_current_uid),
    service: WaterService = Depends(get_water_service),
):
    if uid != body.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await service.log_water(body.user_id, body.amount_ml)


@router.get("/today/{user_id}")
async def get_today(
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: WaterService = Depends(get_water_service),
):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await service.get_today(user_id)


@router.delete("/{log_id}")
async def delete_log(
    log_id: str,
    user_id: str,
    uid: str = Depends(get_current_uid),
    service: WaterService = Depends(get_water_service),
):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await service.delete_log(user_id, log_id)


@router.put("/goal")
async def update_goal(
    body: WaterGoalRequest,
    uid: str = Depends(get_current_uid),
    service: WaterService = Depends(get_water_service),
):
    if uid != body.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return await service.update_goal(body.user_id, body.goal_ml)
