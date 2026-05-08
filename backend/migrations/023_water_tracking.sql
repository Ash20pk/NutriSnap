-- 023_water_tracking.sql
-- Add water tracking and food allergy columns.
-- Safe to run multiple times.

SET search_path TO public;

-- Add columns to profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS water_goal_ml  integer NOT NULL DEFAULT 2500,
    ADD COLUMN IF NOT EXISTS food_allergies text[]  NOT NULL DEFAULT '{}';

-- Water intake logs
CREATE TABLE IF NOT EXISTS public.water_logs (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_ml   integer     NOT NULL CHECK (amount_ml > 0),
    logged_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_water_logs_user_date
    ON public.water_logs (user_id, logged_at DESC);
