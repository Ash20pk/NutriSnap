-- 004_foods_sync_metadata.sql
-- Add sync + usage metadata fields to foods for weekly refresh strategy.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sync_status text NULL,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error text NULL,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_foods_last_used_at
  ON public.foods (last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_foods_last_synced_at
  ON public.foods (last_synced_at ASC);

CREATE INDEX IF NOT EXISTS idx_foods_sync_status
  ON public.foods (sync_status);

COMMENT ON COLUMN public.foods.last_used_at IS 'Last time this food was used in a logged meal';
COMMENT ON COLUMN public.foods.last_synced_at IS 'Last time this food was refreshed from its source provider';
COMMENT ON COLUMN public.foods.sync_status IS 'Sync status: ok, error, pending';
COMMENT ON COLUMN public.foods.retry_count IS 'Number of consecutive sync failures';
COMMENT ON COLUMN public.foods.raw_payload IS 'Raw provider payload used for debugging and auditing';
