-- 018_food_label_submissions.sql
-- Community contributions: store ingredient/nutrition label photo submissions for barcodes.
-- Safe to run multiple times.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.food_label_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  images_base64 jsonb NOT NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_label_submissions_barcode
  ON public.food_label_submissions (barcode);

CREATE INDEX IF NOT EXISTS idx_food_label_submissions_status_created_at
  ON public.food_label_submissions (status, created_at DESC);
