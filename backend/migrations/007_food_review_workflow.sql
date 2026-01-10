-- Migration 007: Food Review Workflow
-- Adds validation gates for user-created foods and meal review status

-- Add review_status to foods table
ALTER TABLE foods 
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'approved';

-- Add review_status to meals table  
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'finalized';

-- Index for filtering pending foods
CREATE INDEX IF NOT EXISTS idx_foods_review_status 
  ON foods(review_status) WHERE review_status = 'pending_review';

-- Index for filtering pending meals
CREATE INDEX IF NOT EXISTS idx_meals_review_status 
  ON meals(review_status, user_id) WHERE review_status = 'pending_review';

COMMENT ON COLUMN foods.review_status IS 'pending_review|approved|rejected - validation status for user-created foods';
COMMENT ON COLUMN meals.review_status IS 'pending_review|finalized - whether meal contains unconfirmed foods';
