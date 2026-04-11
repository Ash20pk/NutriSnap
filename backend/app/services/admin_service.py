"""
Admin service for managing label submissions and reviews.
Handles admin operations for food label approvals and rejections.
"""

import logging
from typing import Dict, Any, List, Optional
import asyncpg
from fastapi import HTTPException

from app.db.queries import to_uuid

logger = logging.getLogger(__name__)


class AdminService:
    """Service for admin operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def list_label_reviews(
        self,
        status: str = "pending",
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        List food label submissions for review.
        
        Args:
            status: Filter by status (pending, approved, rejected)
            limit: Maximum number of results
        
        Returns:
            Dictionary with submissions list and count
        """
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    fls.id,
                    fls.user_id,
                    fls.barcode,
                    fls.label_image_base64,
                    fls.notes,
                    fls.status,
                    fls.created_at,
                    fls.reviewed_at,
                    fls.reviewed_by_admin_id,
                    fls.admin_notes,
                    p.name as user_name,
                    p.username as username
                FROM food_label_submissions fls
                LEFT JOIN profiles p ON p.id = fls.user_id
                WHERE fls.status = $1
                ORDER BY fls.created_at DESC
                LIMIT $2
                """,
                status,
                limit
            )
        
        submissions = []
        for r in rows:
            submissions.append({
                "id": str(r["id"]),
                "user_id": str(r["user_id"]),
                "user_name": r["user_name"],
                "username": r["username"],
                "barcode": r["barcode"],
                "label_image_base64": r["label_image_base64"],
                "notes": r["notes"],
                "status": r["status"],
                "created_at": r["created_at"].isoformat(),
                "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
                "reviewed_by_admin_id": str(r["reviewed_by_admin_id"]) if r["reviewed_by_admin_id"] else None,
                "admin_notes": r["admin_notes"],
            })
        
        return {
            "submissions": submissions,
            "count": len(submissions)
        }
    
    async def approve_label_review(
        self,
        submission_id: str,
        admin_id: str,
        action: str,
        admin_notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve or reject a label submission.
        
        Args:
            submission_id: Submission UUID
            admin_id: Admin user UUID
            action: Action to take (approve, reject)
            admin_notes: Optional admin notes
        
        Returns:
            Dictionary with updated submission status
        """
        if action not in ("approve", "reject"):
            raise HTTPException(status_code=400, detail="Invalid action")
        
        async with self.pool.acquire() as conn:
            # Get submission
            submission = await conn.fetchrow(
                """
                SELECT id, user_id, barcode, label_image_base64, status
                FROM food_label_submissions
                WHERE id = $1
                """,
                to_uuid(submission_id)
            )
            
            if not submission:
                raise HTTPException(status_code=404, detail="Submission not found")
            
            if submission["status"] != "pending":
                raise HTTPException(
                    status_code=400,
                    detail=f"Submission already {submission['status']}"
                )
            
            # Update submission status
            new_status = "approved" if action == "approve" else "rejected"
            
            await conn.execute(
                """
                UPDATE food_label_submissions
                SET status = $1,
                    reviewed_at = now(),
                    reviewed_by_admin_id = $2,
                    admin_notes = $3
                WHERE id = $4
                """,
                new_status,
                to_uuid(admin_id),
                admin_notes,
                to_uuid(submission_id)
            )
            
            # If approved, process the label
            if action == "approve":
                await self._process_approved_label(
                    conn,
                    submission["barcode"],
                    submission["label_image_base64"]
                )
            
            return {
                "submission_id": submission_id,
                "status": new_status,
                "message": f"Submission {action}d successfully"
            }
    
    async def _process_approved_label(
        self,
        conn: asyncpg.Connection,
        barcode: str,
        label_image_base64: str
    ) -> None:
        """Process an approved label submission."""
        # Here you would typically:
        # 1. Extract nutrition data from the label image
        # 2. Save to foods/barcodes table
        # 3. Notify the user
        
        # For now, just log it
        logger.info(f"Processing approved label for barcode: {barcode}")
        
        # You could call the label service here to extract data
        # from app.services.label_service import LabelService
        # label_service = LabelService(self.pool)
        # await label_service._extract_nutrition_data([label_image_base64])
    
    async def get_admin_stats(self) -> Dict[str, Any]:
        """
        Get admin dashboard statistics.
        
        Returns:
            Dictionary with various admin stats
        """
        async with self.pool.acquire() as conn:
            # Pending submissions
            pending_count = await conn.fetchval(
                "SELECT COUNT(*) FROM food_label_submissions WHERE status = 'pending'"
            )
            
            # Total users
            total_users = await conn.fetchval(
                "SELECT COUNT(*) FROM profiles"
            )
            
            # Total meals logged
            total_meals = await conn.fetchval(
                "SELECT COUNT(*) FROM meals"
            )
            
            # Total foods
            total_foods = await conn.fetchval(
                "SELECT COUNT(*) FROM foods"
            )
            
            # Recent activity (last 7 days)
            recent_meals = await conn.fetchval(
                """
                SELECT COUNT(*) FROM meals
                WHERE timestamp >= now() - interval '7 days'
                """
            )
            
            recent_users = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT user_id) FROM meals
                WHERE timestamp >= now() - interval '7 days'
                """
            )
            
            return {
                "pending_submissions": int(pending_count or 0),
                "total_users": int(total_users or 0),
                "total_meals": int(total_meals or 0),
                "total_foods": int(total_foods or 0),
                "recent_meals_7d": int(recent_meals or 0),
                "active_users_7d": int(recent_users or 0),
            }
