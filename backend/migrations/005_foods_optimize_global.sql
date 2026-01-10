-- 005_foods_optimize_global.sql
-- Optimize foods table for global catalog: drop India-specific columns, add quality/freshness metadata
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- Drop India-specific columns (use localization table later if needed)
ALTER TABLE public.foods
  DROP COLUMN IF EXISTS name_hindi,
  DROP COLUMN IF EXISTS serving_size;

-- Add global metadata columns
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS data_type text NULL,
  ADD COLUMN IF NOT EXISTS publication_date date NULL,
  ADD COLUMN IF NOT EXISTS search_rank double precision NULL,
  ADD COLUMN IF NOT EXISTS is_generic boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS retry_after timestamptz NULL;

-- Add indexes for quality filtering and search optimization
CREATE INDEX IF NOT EXISTS idx_foods_data_type
  ON public.foods (data_type);

CREATE INDEX IF NOT EXISTS idx_foods_search_rank
  ON public.foods (search_rank DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_foods_is_generic
  ON public.foods (is_generic);

CREATE INDEX IF NOT EXISTS idx_foods_retry_after
  ON public.foods (retry_after)
  WHERE retry_after IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.foods.data_type IS 'USDA data type: Foundation, SR Legacy, Survey (FNDDS), Branded';
COMMENT ON COLUMN public.foods.publication_date IS 'Date when food data was published by provider';
COMMENT ON COLUMN public.foods.search_rank IS 'Cached search relevance score for optimization';
COMMENT ON COLUMN public.foods.is_generic IS 'True for generic foods, false for branded products';
COMMENT ON COLUMN public.foods.retry_after IS 'Timestamp after which failed sync can be retried (exponential backoff)';
