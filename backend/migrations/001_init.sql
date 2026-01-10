-- 001_init.sql
-- Idempotent migration for NutriSnap backend tables
-- Safe to run multiple times.

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- ============================================
-- Core Tables
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  age integer NOT NULL,
  gender text NOT NULL,
  height double precision NOT NULL,
  weight double precision NOT NULL,
  goal text NOT NULL,
  activity_level text NOT NULL,
  dietary_preference text NOT NULL,
  daily_calorie_target double precision NOT NULL,
  protein_target double precision NOT NULL,
  carbs_target double precision NOT NULL,
  fat_target double precision NOT NULL,
  onboarding_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.foods (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  name_hindi text NULL,
  category text NOT NULL,
  calories_per_100g double precision NOT NULL,
  protein_per_100g double precision NOT NULL,
  carbs_per_100g double precision NOT NULL,
  fat_per_100g double precision NOT NULL,
  serving_size double precision NOT NULL,
  is_vegetarian boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meals (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  meal_type text NOT NULL,
  foods jsonb NOT NULL,
  total_calories double precision NOT NULL,
  total_protein double precision NOT NULL,
  total_carbs double precision NOT NULL,
  total_fat double precision NOT NULL,
  image_base64 text NULL,
  logging_method text NOT NULL,
  notes text NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meals_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
    ON DELETE CASCADE
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_meals_user_ts
  ON public.meals (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_meals_user_type
  ON public.meals (user_id, meal_type);

CREATE INDEX IF NOT EXISTS idx_meals_timestamp
  ON public.meals (timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_name_category
  ON public.foods (lower(name), category);

CREATE INDEX IF NOT EXISTS idx_foods_category
  ON public.foods (category);

CREATE INDEX IF NOT EXISTS idx_foods_veg
  ON public.foods (is_vegetarian);

-- ============================================
-- RLS (optional, but safe)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

-- Meals policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meals' AND policyname = 'meals_select_own'
  ) THEN
    CREATE POLICY meals_select_own
      ON public.meals FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meals' AND policyname = 'meals_insert_own'
  ) THEN
    CREATE POLICY meals_insert_own
      ON public.meals FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meals' AND policyname = 'meals_delete_own'
  ) THEN
    CREATE POLICY meals_delete_own
      ON public.meals FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Foods policies (global reference, read-only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'foods_select_authenticated'
  ) THEN
    CREATE POLICY foods_select_authenticated
      ON public.foods FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE public.profiles IS 'User profile information including goals and macro targets';
COMMENT ON TABLE public.foods IS 'Canonical foods and nutrition data (per 100g)';
COMMENT ON TABLE public.meals IS 'Individual meal logs with nutrition data';

COMMENT ON COLUMN public.meals.foods IS 'JSONB array of food items with quantities and nutrition data';
COMMENT ON COLUMN public.meals.meal_type IS 'Meal type: breakfast, lunch, dinner, or snack';
COMMENT ON COLUMN public.meals.logging_method IS 'How meal was logged: photo, voice, manual, or barcode';

COMMENT ON COLUMN public.foods.category IS 'Food category (e.g. north_indian, south_indian, street_food)';
COMMENT ON COLUMN public.foods.serving_size IS 'Standard serving size in grams';
