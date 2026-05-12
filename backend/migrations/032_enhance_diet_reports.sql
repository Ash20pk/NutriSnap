-- Migration: Enhance diet_reports table with comprehensive report fields

ALTER TABLE public.diet_reports
  ADD COLUMN IF NOT EXISTS executive_summary TEXT,
  ADD COLUMN IF NOT EXISTS strengths JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS areas_for_improvement JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS detailed_analysis JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS specific_recommendations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meal_suggestions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS action_plan JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.diet_reports.executive_summary IS 'Brief overview of diet quality and main findings';
COMMENT ON COLUMN public.diet_reports.strengths IS 'List of specific strengths with examples';
COMMENT ON COLUMN public.diet_reports.areas_for_improvement IS 'List of specific areas needing improvement';
COMMENT ON COLUMN public.diet_reports.detailed_analysis IS 'Detailed analysis of macronutrients, micronutrients, eating patterns, and variety';
COMMENT ON COLUMN public.diet_reports.specific_recommendations IS 'Actionable recommendations with category, why, and implementation steps';
COMMENT ON COLUMN public.diet_reports.meal_suggestions IS 'Specific meal and snack ideas';
COMMENT ON COLUMN public.diet_reports.action_plan IS 'Week-by-week action plan with ongoing habits';
