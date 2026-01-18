-- 017_food_health_check_cache.sql
-- Cache AI health-check results (NutriLens) to reduce OpenAI cost.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.food_health_check_cache (
  barcode text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_health_check_cache_expires_at
  ON public.food_health_check_cache (expires_at);
