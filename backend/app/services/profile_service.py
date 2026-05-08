"""
Profile service for user profile management.
Handles user onboarding, profile updates, goals, and weight tracking.
"""

import logging
import os
from datetime import datetime, date
from typing import Dict, Any, Optional
import asyncpg
import httpx
from fastapi import HTTPException

from app.utils.nutrition import calculate_calorie_target, calculate_age_from_dob
from app.db.queries import to_uuid, profile_from_record

logger = logging.getLogger(__name__)


class ProfileService:
    """Service for managing user profiles and related data."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def onboard_user(
        self,
        uid: str,
        name: str,
        date_of_birth: str,
        gender: str,
        height: float,
        weight: float,
        goal: str,
        activity_level: str,
        dietary_preference: str,
        food_allergies: Optional[list] = None,
    ) -> Dict[str, Any]:
        """
        Create or update user profile during onboarding.
        
        Args:
            uid: User UUID
            name: User's name
            date_of_birth: Date of birth in YYYY-MM-DD format
            gender: "male" or "female"
            height: Height in cm
            weight: Weight in kg
            goal: "lose_weight", "gain_muscle", or "maintain"
            activity_level: Activity level string
            dietary_preference: Dietary preference string
            food_allergies: Optional list of allergy/intolerance strings

        Returns:
            User profile dictionary
        """
        try:
            # Parse date of birth and calculate age
            dob = date.fromisoformat(date_of_birth)
            age = calculate_age_from_dob(dob)
            
            # Calculate nutrition targets
            targets = calculate_calorie_target(
                weight, height, age, gender, activity_level, goal
            )
            
            allergies = list(food_allergies) if food_allergies else []
            async with self.pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    INSERT INTO profiles (
                        id, name, date_of_birth, age, gender, height, weight,
                        goal, activity_level, dietary_preference, food_allergies,
                        daily_calorie_target, protein_target, carbs_target, fat_target,
                        onboarding_completed, last_weight_check
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                    ON CONFLICT (id) DO UPDATE
                    SET
                        name = EXCLUDED.name,
                        date_of_birth = EXCLUDED.date_of_birth,
                        age = EXCLUDED.age,
                        gender = EXCLUDED.gender,
                        height = EXCLUDED.height,
                        weight = EXCLUDED.weight,
                        goal = EXCLUDED.goal,
                        activity_level = EXCLUDED.activity_level,
                        dietary_preference = EXCLUDED.dietary_preference,
                        food_allergies = EXCLUDED.food_allergies,
                        daily_calorie_target = EXCLUDED.daily_calorie_target,
                        protein_target = EXCLUDED.protein_target,
                        carbs_target = EXCLUDED.carbs_target,
                        fat_target = EXCLUDED.fat_target,
                        onboarding_completed = EXCLUDED.onboarding_completed,
                        last_weight_check = EXCLUDED.last_weight_check
                    RETURNING *
                    """,
                    to_uuid(uid),
                    name,
                    dob,
                    age,
                    gender,
                    height,
                    weight,
                    goal,
                    activity_level,
                    dietary_preference,
                    allergies,
                    targets["daily_calorie_target"],
                    targets["protein_target"],
                    targets["carbs_target"],
                    targets["fat_target"],
                    True,  # onboarding_completed
                    datetime.utcnow(),  # last_weight_check
                )
                
                # Record initial weight in weight history
                await conn.execute(
                    """
                    INSERT INTO weight_history (user_id, weight, recorded_at, notes)
                    VALUES ($1, $2, $3, $4)
                    """,
                    to_uuid(uid),
                    weight,
                    datetime.utcnow(),
                    "Initial weight from onboarding",
                )
                
                if not row:
                    raise HTTPException(status_code=500, detail="Failed to create profile")
                
                return profile_from_record(row)
        
        except ValueError as e:
            logger.error(f"Invalid date format: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid date_of_birth format. Use YYYY-MM-DD")
        except Exception as e:
            logger.error(f"Error onboarding user: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_profile(self, user_id: str) -> Dict[str, Any]:
        """
        Get user profile by ID.
        
        Args:
            user_id: User UUID
        
        Returns:
            User profile dictionary
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM profiles WHERE id = $1",
                to_uuid(user_id)
            )
        
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        
        return profile_from_record(row)
    
    async def update_profile(
        self,
        uid: str,
        bio: Optional[str] = None,
        avatar_url: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update user profile bio, avatar, and display name.

        Args:
            uid: User UUID
            bio: User bio text
            avatar_url: Avatar image URL
            name: Display name

        Returns:
            Updated user profile
        """
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE profiles
                SET bio = COALESCE($2, bio),
                    avatar_url = COALESCE($3, avatar_url),
                    name = COALESCE($4, name)
                WHERE id = $1
                RETURNING *
                """,
                to_uuid(uid),
                bio,
                avatar_url,
                name,
            )

        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        return profile_from_record(row)
    
    async def update_goals(
        self,
        user_id: str,
        goal: str,
        activity_level: str
    ) -> Dict[str, Any]:
        """
        Update user goals and recalculate nutrition targets.
        
        Args:
            user_id: User UUID
            goal: New goal ("lose_weight", "gain_muscle", "maintain")
            activity_level: New activity level
        
        Returns:
            Updated user profile
        """
        async with self.pool.acquire() as conn:
            user_row = await conn.fetchrow(
                "SELECT * FROM profiles WHERE id = $1",
                to_uuid(user_id)
            )
            
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            
            # Derive age from DOB if available, else fall back to stored integer
            dob = user_row.get("date_of_birth")
            age = calculate_age_from_dob(dob) if dob else int(user_row["age"] or 25)

            # Calculate new targets
            targets = calculate_calorie_target(
                float(user_row["weight"]),
                float(user_row["height"]),
                age,
                str(user_row["gender"]),
                activity_level,
                goal,
            )
            
            # Update profile
            row = await conn.fetchrow(
                """
                UPDATE profiles
                SET goal = $2,
                    activity_level = $3,
                    daily_calorie_target = $4,
                    protein_target = $5,
                    carbs_target = $6,
                    fat_target = $7
                WHERE id = $1
                RETURNING *
                """,
                to_uuid(user_id),
                goal,
                activity_level,
                targets["daily_calorie_target"],
                targets["protein_target"],
                targets["carbs_target"],
                targets["fat_target"],
            )
            
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            
            return profile_from_record(row)
    
    async def record_weight_check(
        self,
        uid: str,
        weight: float,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Record monthly weight check and update profile.
        
        Args:
            uid: User UUID
            weight: New weight in kg
            notes: Optional notes about the weight check
        
        Returns:
            Updated user profile
        """
        async with self.pool.acquire() as conn:
            # Get current profile
            user_row = await conn.fetchrow(
                "SELECT * FROM profiles WHERE id = $1",
                to_uuid(uid)
            )
            
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            
            old_weight = float(user_row["weight"])
            
            # Get age from DOB or stored age
            dob = user_row.get("date_of_birth")
            if dob:
                age = calculate_age_from_dob(dob)
            else:
                age = int(user_row["age"])
            
            # Calculate new targets
            targets = calculate_calorie_target(
                weight,
                float(user_row["height"]),
                age,
                str(user_row["gender"]),
                str(user_row["activity_level"]),
                str(user_row["goal"]),
            )
            
            # Update profile
            row = await conn.fetchrow(
                """
                UPDATE profiles
                SET weight = $2,
                    last_weight_check = $3,
                    daily_calorie_target = $4,
                    protein_target = $5,
                    carbs_target = $6,
                    fat_target = $7
                WHERE id = $1
                RETURNING *
                """,
                to_uuid(uid),
                weight,
                datetime.utcnow(),
                targets["daily_calorie_target"],
                targets["protein_target"],
                targets["carbs_target"],
                targets["fat_target"],
            )
            
            # Record in weight history
            await conn.execute(
                """
                INSERT INTO weight_history (user_id, weight, recorded_at, notes)
                VALUES ($1, $2, $3, $4)
                """,
                to_uuid(uid),
                weight,
                datetime.utcnow(),
                notes or f"Weight changed from {old_weight:.1f}kg to {weight:.1f}kg",
            )
            
            if not row:
                raise HTTPException(status_code=500, detail="Failed to update profile")
            
            return profile_from_record(row)
    
    async def get_weight_history(
        self,
        uid: str,
        limit: int = 12
    ) -> list:
        """
        Get user's weight history.
        
        Args:
            uid: User UUID
            limit: Maximum number of entries to return
        
        Returns:
            List of weight history entries
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, weight, recorded_at, notes
                FROM weight_history
                WHERE user_id = $1
                ORDER BY recorded_at DESC
                LIMIT $2
                """,
                to_uuid(uid),
                limit,
            )
        
        return [
            {
                "id": str(row["id"]),
                "weight": float(row["weight"]),
                "recorded_at": row["recorded_at"],
                "notes": row.get("notes"),
            }
            for row in rows
        ]
    
    async def set_username(
        self,
        uid: str,
        username: str
    ) -> Dict[str, str]:
        """
        Set or update user's username.
        
        Args:
            uid: User UUID
            username: Desired username (3-20 chars, alphanumeric + underscore)
        
        Returns:
            Dictionary with user_id and username
        """
        import re
        from asyncpg.exceptions import UniqueViolationError
        
        username = username.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,20}$", username):
            raise HTTPException(
                status_code=400,
                detail="Username must be 3-20 chars and contain only letters, numbers, underscores"
            )
        
        async with self.pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    "UPDATE profiles SET username = $2 WHERE id = $1 RETURNING id, username",
                    to_uuid(uid),
                    username,
                )
            except UniqueViolationError:
                raise HTTPException(status_code=409, detail="Username is already taken")
        
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        return {"user_id": str(row["id"]), "username": row["username"]}

    async def redeem_promo_code(self, uid: str, code: str) -> Dict[str, Any]:
        """
        Redeem a promo code for the current user.
        Sets is_special_user=True on the profile if the code grants it.
        """
        code = code.strip().upper()
        async with self.pool.acquire() as conn:
            promo = await conn.fetchrow(
                "SELECT * FROM promo_codes WHERE code = $1",
                code,
            )
            if not promo:
                raise HTTPException(status_code=404, detail="Invalid promo code")

            if promo["expires_at"] and promo["expires_at"] < datetime.utcnow().replace(tzinfo=promo["expires_at"].tzinfo):
                raise HTTPException(status_code=410, detail="Promo code has expired")

            if promo["max_uses"] is not None and promo["use_count"] >= promo["max_uses"]:
                raise HTTPException(status_code=410, detail="Promo code has reached its usage limit")

            existing = await conn.fetchrow(
                "SELECT id FROM promo_code_redemptions WHERE user_id = $1 AND code = $2",
                to_uuid(uid), code,
            )
            if existing:
                raise HTTPException(status_code=409, detail="You have already redeemed this code")

            await conn.execute(
                "INSERT INTO promo_code_redemptions (user_id, code) VALUES ($1, $2)",
                to_uuid(uid), code,
            )
            await conn.execute(
                "UPDATE promo_codes SET use_count = use_count + 1 WHERE code = $1",
                code,
            )

            if promo["is_special_user"]:
                await conn.execute(
                    "UPDATE profiles SET is_special_user = true WHERE id = $1",
                    to_uuid(uid),
                )

            row = await conn.fetchrow("SELECT * FROM profiles WHERE id = $1", to_uuid(uid))
            return {
                **profile_from_record(row),
                "redeemed_code": code,
                "special_user_unlocked": bool(promo["is_special_user"]),
            }

    async def delete_account(self, uid: str) -> Dict[str, str]:
        """
        Permanently delete user account and all associated data.

        Deletes the profile row (cascading to meals, quests, etc.) then
        removes the Supabase Auth user via the Admin API if credentials are
        configured.

        Args:
            uid: User UUID

        Returns:
            Confirmation message
        """
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM profiles WHERE id = $1",
                to_uuid(uid),
            )
            if result == "DELETE 0":
                raise HTTPException(status_code=404, detail="User not found")

        supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if supabase_url and service_role_key:
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.delete(
                        f"{supabase_url}/auth/v1/admin/users/{uid}",
                        headers={
                            "apikey": service_role_key,
                            "Authorization": f"Bearer {service_role_key}",
                        },
                    )
            except Exception:
                logger.warning("Failed to delete Supabase auth user %s — profile data already removed", uid)

        return {"detail": "Account deleted successfully"}
