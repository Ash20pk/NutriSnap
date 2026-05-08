"""
Database query helpers and record converters.
Common utilities for working with asyncpg records and UUIDs.
"""

import json
import uuid
from datetime import datetime, date
from typing import Dict, Any
import asyncpg
from fastapi import HTTPException

from app.utils.nutrition import calculate_age_from_dob


def to_uuid(value: str) -> uuid.UUID:
    """
    Convert a string to UUID, raising HTTPException if invalid.
    
    Args:
        value: String representation of UUID
    
    Returns:
        UUID object
    
    Raises:
        HTTPException: If the string is not a valid UUID
    """
    try:
        return uuid.UUID(str(value))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid UUID")


def profile_from_record(record: asyncpg.Record) -> Dict[str, Any]:
    """
    Convert a database profile record to a dictionary.
    
    Calculates age from date of birth if available, determines if weight check is due.
    
    Args:
        record: asyncpg Record from profiles table
    
    Returns:
        Dictionary with profile data
    """
    # Calculate age from DOB if available, otherwise use stored age
    dob = record.get("date_of_birth")
    if dob:
        age = calculate_age_from_dob(dob)
        dob_str = dob.isoformat() if isinstance(dob, date) else str(dob)
    else:
        age = record.get("age") or 0
        dob_str = None

    # Check if weight check is due (>30 days since last check)
    last_weight_check = record.get("last_weight_check")
    weight_check_due = False
    if last_weight_check:
        days_since_check = (datetime.utcnow() - last_weight_check.replace(tzinfo=None)).days
        weight_check_due = days_since_check >= 30
    else:
        # If never checked, it's due (user should set initial weight check after onboarding)
        weight_check_due = record.get("onboarding_completed", False)

    return {
        "id": str(record["id"]),
        "username": record.get("username"),
        "bio": record.get("bio"),
        "avatar_url": record.get("avatar_url"),
        "name": record["name"],
        "age": age,
        "date_of_birth": dob_str,
        "gender": record["gender"],
        "height": record["height"],
        "weight": record["weight"],
        "goal": record["goal"],
        "activity_level": record["activity_level"],
        "dietary_preference": record["dietary_preference"],
        "food_allergies": list(record["food_allergies"]) if record.get("food_allergies") else [],
        "water_goal_ml": record.get("water_goal_ml", 2500),
        "daily_calorie_target": record["daily_calorie_target"],
        "protein_target": record["protein_target"],
        "carbs_target": record["carbs_target"],
        "fat_target": record["fat_target"],
        "created_at": record["created_at"],
        "onboarding_completed": record["onboarding_completed"],
        "last_weight_check": last_weight_check,
        "weight_check_due": weight_check_due,
        "is_special_user": record.get("is_special_user", False),
    }


def meal_from_record(record: asyncpg.Record) -> Dict[str, Any]:
    """
    Convert a database meal record to a dictionary.
    
    Handles JSON parsing of foods and micros fields.
    
    Args:
        record: asyncpg Record from meals table
    
    Returns:
        Dictionary with meal data
    """
    foods = record["foods"]
    if isinstance(foods, str):
        try:
            foods = json.loads(foods)
        except Exception:
            # If parsing fails, keep original value and let validation raise a clear error
            pass
    
    micros = record.get("micros", {})
    if isinstance(micros, str):
        try:
            micros = json.loads(micros)
        except Exception:
            micros = {}
    
    return {
        "id": str(record["id"]),
        "user_id": str(record["user_id"]),
        "meal_type": record["meal_type"],
        "foods": foods,
        "micros": micros,
        "total_calories": record["total_calories"],
        "total_protein": record["total_protein"],
        "total_carbs": record["total_carbs"],
        "total_fat": record["total_fat"],
        "image_base64": record["image_base64"],
        "logging_method": record["logging_method"],
        "notes": record["notes"],
        "timestamp": record["timestamp"],
    }
