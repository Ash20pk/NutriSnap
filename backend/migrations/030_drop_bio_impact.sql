-- Migration: Remove bio_impact and recommendations columns from analytics_cache
-- Also add 'daily' to the time_range check constraint

ALTER TABLE public.analytics_cache
  DROP COLUMN IF EXISTS bio_impact,
  DROP COLUMN IF EXISTS recommendations;

-- Extend time_range check to include 'daily' (needed by the service)
ALTER TABLE public.analytics_cache
  DROP CONSTRAINT IF EXISTS analytics_cache_time_range_check;

ALTER TABLE public.analytics_cache
  ADD CONSTRAINT analytics_cache_time_range_check CHECK (
    time_range = ANY (ARRAY['daily'::text, 'week'::text, 'month'::text, 'year'::text])
  );