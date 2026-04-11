-- Migration: Add date_of_birth and weight tracking to profiles
-- Purpose: Store DOB for accurate age calculation over time, track weight history

-- Add date_of_birth column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Add weight tracking columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_weight_check timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_check_reminder boolean DEFAULT true;

-- Create weight history table for monthly tracking
CREATE TABLE IF NOT EXISTS weight_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    weight numeric NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    notes text
);

CREATE INDEX IF NOT EXISTS idx_weight_history_user ON weight_history(user_id, recorded_at DESC);

-- Migrate existing age data to approximate DOB (assumes birthday is Jan 1)
-- This is a best-effort migration for existing users
UPDATE profiles
SET date_of_birth = (CURRENT_DATE - (age * INTERVAL '1 year'))::date
WHERE age IS NOT NULL AND date_of_birth IS NULL;

-- Function to calculate age from DOB
CREATE OR REPLACE FUNCTION calculate_age_from_dob(dob date)
RETURNS int AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comment
COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth for accurate age calculation';
COMMENT ON COLUMN profiles.last_weight_check IS 'Timestamp of last weight check for monthly reminders';
COMMENT ON TABLE weight_history IS 'Monthly weight tracking history for users';
