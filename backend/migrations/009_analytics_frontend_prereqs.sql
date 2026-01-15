-- 009_analytics_frontend_prereqs.sql
-- Add/ensure columns and indexes needed by the frontend analytics UI
-- This migration is additive and safe to run multiple times

-- 1) Add/ensure core analytics columns
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS timestamp timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS meal_type text,
  ADD COLUMN IF NOT EXISTS total_calories numeric,
  ADD COLUMN IF NOT EXISTS total_protein numeric,
  ADD COLUMN IF NOT EXISTS total_carbs numeric,
  ADD COLUMN IF NOT EXISTS total_fat numeric,
  ADD COLUMN IF NOT EXISTS foods jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS micros jsonb DEFAULT '{}'::jsonb;

-- 2) Optional: constrain meal_type to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meals_meal_type_check'
  ) THEN
    ALTER TABLE meals
      ADD CONSTRAINT meals_meal_type_check
      CHECK (meal_type IS NULL OR meal_type IN ('breakfast','lunch','dinner','snack','other'));
  END IF;
END$$;

-- 3) Indexes for analytics queries
-- Fast filtering by user and time window
CREATE INDEX IF NOT EXISTS idx_meals_user_time ON meals (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_meals_time ON meals (timestamp DESC);

-- Optional JSONB indexes if we later query JSON directly
-- CREATE INDEX IF NOT EXISTS idx_meals_foods_gin ON meals USING GIN (foods);
-- CREATE INDEX IF NOT EXISTS idx_meals_micros_gin ON meals USING GIN (micros);
