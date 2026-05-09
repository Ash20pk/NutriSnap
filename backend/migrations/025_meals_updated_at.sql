-- Add updated_at column to meals table
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
