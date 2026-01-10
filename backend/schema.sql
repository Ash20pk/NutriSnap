-- NutriSnap Database Schema
-- Run this in Supabase SQL Editor to initialize the database

-- Ensure target schema exists
CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- ============================================
-- Core Tables
-- ============================================

-- User profiles table
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

-- Foods table (nutrition source of truth)
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

-- Meal logs table
CREATE TABLE IF NOT EXISTS public.meals (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meal_type text NOT NULL,
    foods jsonb NOT NULL,
    total_calories double precision NOT NULL,
    total_protein double precision NOT NULL,
    total_carbs double precision NOT NULL,
    total_fat double precision NOT NULL,
    image_base64 text NULL,
    logging_method text NOT NULL,
    notes text NULL,
    timestamp timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================

-- Index for efficient meal history queries by user and date
CREATE INDEX IF NOT EXISTS idx_meals_user_ts 
    ON public.meals (user_id, timestamp DESC);

-- Foods indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_name_category
    ON public.foods (lower(name), category);

CREATE INDEX IF NOT EXISTS idx_foods_category
    ON public.foods (category);

CREATE INDEX IF NOT EXISTS idx_foods_veg
    ON public.foods (is_vegetarian);

-- Additional useful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_meals_user_type 
    ON public.meals (user_id, meal_type);

CREATE INDEX IF NOT EXISTS idx_meals_timestamp 
    ON public.meals (timestamp DESC);

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================
-- These policies ensure users can only access their own data
-- when querying from Supabase client (optional, backend uses service role)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Meals policies
CREATE POLICY "meals_select_own" 
    ON public.meals FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "meals_insert_own" 
    ON public.meals FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "meals_delete_own" 
    ON public.meals FOR DELETE 
    USING (auth.uid() = user_id);

-- Foods policies
-- Foods are global reference data; allow read for authenticated users.
CREATE POLICY "foods_select_authenticated" 
    ON public.foods FOR SELECT 
    USING (auth.role() = 'authenticated');

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE public.profiles IS 'User profile information including goals and macro targets';
COMMENT ON TABLE public.foods IS 'Canonical foods and nutrition data (per 100g)';
COMMENT ON TABLE public.meals IS 'Individual meal logs with nutrition data';

COMMENT ON COLUMN public.profiles.goal IS 'User fitness goal: lose_weight, gain_muscle, maintain, or general_health';
COMMENT ON COLUMN public.profiles.activity_level IS 'Activity level: sedentary, light, moderate, active, or very_active';
COMMENT ON COLUMN public.profiles.dietary_preference IS 'Dietary preference: vegetarian, vegan, non_veg, or no_restriction';

COMMENT ON COLUMN public.meals.foods IS 'JSONB array of food items with quantities and nutrition data';
COMMENT ON COLUMN public.meals.meal_type IS 'Meal type: breakfast, lunch, dinner, or snack';
COMMENT ON COLUMN public.meals.logging_method IS 'How meal was logged: photo, voice, manual, or barcode';

COMMENT ON COLUMN public.foods.category IS 'Food category (e.g. north_indian, south_indian, street_food)';
COMMENT ON COLUMN public.foods.serving_size IS 'Standard serving size in grams';
