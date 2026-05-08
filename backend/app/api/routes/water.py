"""Water intake tracking routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.dependencies import get_pool, verify_token

router = APIRouter(prefix="/water", tags=["water"])


class WaterLogRequest(BaseModel):
    user_id: str
    amount_ml: int


class WaterGoalRequest(BaseModel):
    user_id: str
    goal_ml: int


@router.post("/log")
async def log_water(body: WaterLogRequest, uid: str = Depends(verify_token), pool=Depends(get_pool)):
    if uid != body.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services.water_service import WaterService
    return await WaterService(pool).log_water(body.user_id, body.amount_ml)


@router.get("/today/{user_id}")
async def get_today(user_id: str, uid: str = Depends(verify_token), pool=Depends(get_pool)):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services.water_service import WaterService
    return await WaterService(pool).get_today(user_id)


@router.delete("/{log_id}")
async def delete_log(
    log_id: str,
    user_id: str,
    uid: str = Depends(verify_token),
    pool=Depends(get_pool),
):
    if uid != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services.water_service import WaterService
    return await WaterService(pool).delete_log(user_id, log_id)


@router.put("/goal")
async def update_goal(body: WaterGoalRequest, uid: str = Depends(verify_token), pool=Depends(get_pool)):
    if uid != body.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services.water_service import WaterService
    return await WaterService(pool).update_goal(body.user_id, body.goal_ml)
