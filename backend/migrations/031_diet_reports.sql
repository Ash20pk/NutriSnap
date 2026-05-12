-- Migration: Create diet_reports table for weekly/monthly/yearly diet reports

CREATE TABLE IF NOT EXISTS public.diet_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  time_range text NOT NULL CHECK (time_range IN ('week', 'month', 'year')),
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  grade text NOT NULL CHECK (grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')),
  justification text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  bio_alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  red_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_foods jsonb NOT NULL DEFAULT '[]'::jsonb,
  macro_balance text,
  micronutrient_status text,
  eating_pattern text,
  variety text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
) TABLESPACE pg_default;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diet_reports_user_range_date 
  ON public.diet_reports (user_id, time_range, report_date) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_diet_reports_user 
  ON public.diet_reports (user_id) 
  TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_diet_reports_date 
  ON public.diet_reports (report_date) 
  TABLESPACE pg_default;

COMMENT ON TABLE public.diet_reports IS 'Stores generated diet reports for weekly/monthly/yearly periods';
