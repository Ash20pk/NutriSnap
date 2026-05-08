-- ============================================================
-- NutriSnap — Authoritative Production Schema
-- Run in Supabase SQL Editor (idempotent — safe to re-run)
-- Last updated: 2026-04
-- ============================================================

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- SECTION 1: Core user & food tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id                      uuid PRIMARY KEY,              -- matches Supabase auth.uid()
    name                    text NOT NULL,
    age                     integer,                       -- legacy; derive from date_of_birth
    date_of_birth           date,
    gender                  text NOT NULL,                 -- 'male' | 'female'
    height                  double precision NOT NULL,     -- cm
    weight                  double precision NOT NULL,     -- kg
    goal                    text NOT NULL,                 -- 'lose_weight' | 'gain_muscle' | 'maintain' | 'general_health'
    activity_level          text NOT NULL,                 -- 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
    dietary_preference      text NOT NULL,                 -- 'vegetarian' | 'vegan' | 'non_veg' | 'no_restriction'
    daily_calorie_target    double precision NOT NULL,
    protein_target          double precision NOT NULL,
    carbs_target            double precision NOT NULL,
    fat_target              double precision NOT NULL,
    onboarding_completed    boolean NOT NULL DEFAULT true,
    username                text NULL,
    bio                     text NULL,
    avatar_url              text NULL,
    last_weight_check       timestamptz,
    weight_check_reminder   boolean DEFAULT true,
    is_special_user         boolean NOT NULL DEFAULT false,  -- unlocks pink Aayu theme
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
    ON public.profiles (lower(username))
    WHERE username IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.foods (
    id                          uuid PRIMARY KEY,
    name                        text NOT NULL,
    category                    text NOT NULL,             -- e.g. 'north_indian', 'street_food', 'user'
    calories_per_100g           double precision NOT NULL,
    protein_per_100g            double precision NOT NULL,
    carbs_per_100g              double precision NOT NULL,
    fat_per_100g                double precision NOT NULL,
    is_vegetarian               boolean NOT NULL DEFAULT true,

    -- Micronutrients (all per 100 g, nullable)
    fiber_g_per_100g            double precision,
    sugar_g_per_100g            double precision,
    saturated_fat_g_per_100g    double precision,
    trans_fat_g_per_100g        double precision,
    cholesterol_mg_per_100g     double precision,
    sodium_mg_per_100g          double precision,
    potassium_mg_per_100g       double precision,
    vitamin_a_ug_per_100g       double precision,
    vitamin_c_mg_per_100g       double precision,
    vitamin_d_ug_per_100g       double precision,
    vitamin_e_mg_per_100g       double precision,
    vitamin_k_ug_per_100g       double precision,
    thiamin_b1_mg_per_100g      double precision,
    riboflavin_b2_mg_per_100g   double precision,
    niacin_b3_mg_per_100g       double precision,
    vitamin_b6_mg_per_100g      double precision,
    folate_ug_per_100g          double precision,
    vitamin_b12_ug_per_100g     double precision,
    calcium_mg_per_100g         double precision,
    iron_mg_per_100g            double precision,
    magnesium_mg_per_100g       double precision,
    phosphorus_mg_per_100g      double precision,
    zinc_mg_per_100g            double precision,
    copper_mg_per_100g          double precision,
    manganese_mg_per_100g       double precision,
    selenium_ug_per_100g        double precision,
    caffeine_mg_per_100g        double precision,
    alcohol_g_per_100g          double precision,

    -- Catalog / sync metadata
    source                      text,                      -- 'seed' | 'usda' | 'user' | 'off' | 'manual'
    external_id                 text,
    brand                       text,
    barcode                     text,
    language                    text,
    region                      text,
    image_url                   text,
    ingredients                 text,
    verified                    boolean NOT NULL DEFAULT false,
    review_status               text DEFAULT 'approved',   -- 'approved' | 'pending_review'
    nutrients_jsonb             jsonb,                     -- raw payload if needed
    raw_payload                 jsonb,
    last_used_at                timestamptz,
    last_synced_at              timestamptz,
    sync_status                 text,
    sync_error                  text,
    retry_count                 integer NOT NULL DEFAULT 0,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    created_by_user_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_source_external_id
    ON public.foods (source, external_id)
    WHERE source IS NOT NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_foods_barcode
    ON public.foods (barcode)
    WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foods_name_lower      ON public.foods (lower(name));
CREATE INDEX IF NOT EXISTS idx_foods_brand_lower     ON public.foods (lower(brand));
CREATE INDEX IF NOT EXISTS idx_foods_category        ON public.foods (category);
CREATE INDEX IF NOT EXISTS idx_foods_veg             ON public.foods (is_vegetarian);
CREATE INDEX IF NOT EXISTS idx_foods_last_used_at    ON public.foods (last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_foods_last_synced_at  ON public.foods (last_synced_at ASC);
CREATE INDEX IF NOT EXISTS idx_foods_sync_status     ON public.foods (sync_status);


CREATE TABLE IF NOT EXISTS public.meals (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    meal_type       text NOT NULL,                         -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
    foods           jsonb NOT NULL,                        -- [{food_id, name, quantity, calories, protein, carbs, fat, …}]
    total_calories  double precision NOT NULL,
    total_protein   double precision NOT NULL,
    total_carbs     double precision NOT NULL,
    total_fat       double precision NOT NULL,
    image_base64    text,                                  -- TODO: migrate to Supabase Storage URL
    logging_method  text NOT NULL,                         -- 'photo' | 'voice' | 'manual' | 'barcode' | 'text'
    notes           text,
    micros          jsonb DEFAULT '{}',                    -- micronutrient breakdown
    review_status   text DEFAULT 'finalized',              -- 'finalized' | 'pending_review'
    timestamp       timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meals_user_ts    ON public.meals (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_meals_user_type  ON public.meals (user_id, meal_type);

-- ============================================================
-- SECTION 2: Barcode / packaged product tables
-- ============================================================

-- Canonical packaged-food data (OpenFoodFacts + user contributions)
CREATE TABLE IF NOT EXISTS public.barcodes (
    barcode             text PRIMARY KEY,
    product_name        text NOT NULL,
    brand               text,
    image_url           text,
    calories_per_100g   numeric NOT NULL DEFAULT 0,
    protein_per_100g    numeric NOT NULL DEFAULT 0,
    carbs_per_100g      numeric NOT NULL DEFAULT 0,
    fat_per_100g        numeric NOT NULL DEFAULT 0,
    fiber_g_per_100g    numeric,
    sugar_g_per_100g    numeric,
    sodium_mg_per_100g  numeric,
    ingredients         text,
    source              text NOT NULL DEFAULT 'openfoodfacts', -- 'openfoodfacts' | 'user_contribution' | 'manual'
    source_updated_at   timestamptz,
    verified            boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_barcodes_source      ON public.barcodes (source);
CREATE INDEX IF NOT EXISTS idx_barcodes_verified    ON public.barcodes (verified);
CREATE INDEX IF NOT EXISTS idx_barcodes_updated_at  ON public.barcodes (updated_at DESC);

CREATE OR REPLACE FUNCTION public.update_barcodes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS barcodes_updated_at ON public.barcodes;
CREATE TRIGGER barcodes_updated_at
    BEFORE UPDATE ON public.barcodes
    FOR EACH ROW EXECUTE FUNCTION public.update_barcodes_updated_at();


-- AI result cache for /foods/health-check (saves OpenAI tokens)
CREATE TABLE IF NOT EXISTS public.food_health_check_cache (
    barcode         text PRIMARY KEY,
    response_json   jsonb NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_health_check_cache_expires ON public.food_health_check_cache (expires_at);


-- User-submitted label photos (community contribution pipeline)
CREATE TABLE IF NOT EXISTS public.food_label_submissions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    barcode     text NOT NULL,
    images_base64 jsonb NOT NULL,
    notes       text,
    status      text NOT NULL DEFAULT 'pending',           -- 'pending' | 'approved' | 'rejected'
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_label_submissions_barcode
    ON public.food_label_submissions (barcode);
CREATE INDEX IF NOT EXISTS idx_food_label_submissions_status
    ON public.food_label_submissions (status, created_at DESC);


-- Admin review queue for AI-extracted label data
CREATE TABLE IF NOT EXISTS public.food_label_reviews (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode             text NOT NULL,
    submitted_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    product_name        text,
    brand               text,
    calories_per_100g   numeric,
    protein_per_100g    numeric,
    carbs_per_100g      numeric,
    fat_per_100g        numeric,
    fiber_g_per_100g    numeric,
    sugar_g_per_100g    numeric,
    sodium_mg_per_100g  numeric,
    ingredients         text,
    health_check_json   jsonb,
    status              text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at         timestamptz,
    review_notes        text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_label_reviews_barcode     ON public.food_label_reviews (barcode);
CREATE INDEX IF NOT EXISTS idx_food_label_reviews_status      ON public.food_label_reviews (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_label_reviews_submitted   ON public.food_label_reviews (submitted_by);

CREATE OR REPLACE FUNCTION public.update_food_label_reviews_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS food_label_reviews_updated_at ON public.food_label_reviews;
CREATE TRIGGER food_label_reviews_updated_at
    BEFORE UPDATE ON public.food_label_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_food_label_reviews_updated_at();


-- Async enrichment queue for foods not yet in catalog
CREATE TABLE IF NOT EXISTS public.foods_ingestion_queue (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id         uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    query           text NOT NULL,
    status          text NOT NULL DEFAULT 'pending',       -- 'pending' | 'processing' | 'done' | 'error'
    attempt_count   int NOT NULL DEFAULT 0,
    last_error      text,
    next_attempt_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_status_next ON public.foods_ingestion_queue (status, next_attempt_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_food_id ON public.foods_ingestion_queue (food_id);
CREATE INDEX IF NOT EXISTS idx_queue_query_lower ON public.foods_ingestion_queue (lower(query));

-- ============================================================
-- SECTION 3: Analytics
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analytics_cache (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    time_range          text NOT NULL CHECK (time_range IN ('week', 'month', 'year')),
    insights            jsonb NOT NULL DEFAULT '{}',
    bio_impact          jsonb NOT NULL DEFAULT '{}',
    recommendations     jsonb NOT NULL DEFAULT '[]',       -- legacy alias; prefer red_flags
    health_insights     jsonb NOT NULL DEFAULT '{}',       -- organ-specific insights
    bio_alerts          jsonb NOT NULL DEFAULT '[]',       -- biomarker alerts
    red_flags           jsonb NOT NULL DEFAULT '[]',       -- problematic pattern flags
    meals_analyzed      int NOT NULL DEFAULT 0,
    date_range_start    timestamptz NOT NULL,
    date_range_end      timestamptz NOT NULL,
    expires_at          timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
    last_refreshed_at   timestamptz NOT NULL DEFAULT now(),
    refresh_count       int NOT NULL DEFAULT 0,
    tokens_used         int NOT NULL DEFAULT 0,
    analysis_duration_ms int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_cache_user_range ON public.analytics_cache (user_id, time_range);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires ON public.analytics_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_analytics_cache_user    ON public.analytics_cache (user_id);

-- ============================================================
-- SECTION 4: Gamification (quests, XP, badges, streaks)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.quest_definitions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_type      text NOT NULL,  -- 'log_meals' | 'hit_protein' | 'hit_calories' | 'hit_all_macros' | 'log_photo' | 'streak'
    title           text NOT NULL,
    description     text,
    icon            text NOT NULL DEFAULT 'checkmark-circle',
    icon_color      text NOT NULL DEFAULT '#2F593E',
    xp_reward       int NOT NULL DEFAULT 20,
    target_value    int NOT NULL DEFAULT 1,
    target_unit     text,
    difficulty      text NOT NULL DEFAULT 'easy',
    is_daily        boolean NOT NULL DEFAULT true,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.user_quests (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    quest_definition_id     uuid NOT NULL REFERENCES public.quest_definitions(id) ON DELETE CASCADE,
    quest_date              date NOT NULL DEFAULT CURRENT_DATE,
    current_value           double precision NOT NULL DEFAULT 0,
    target_value            double precision NOT NULL,
    is_completed            boolean NOT NULL DEFAULT false,
    completed_at            timestamptz,
    xp_claimed              boolean NOT NULL DEFAULT false,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, quest_definition_id, quest_date)
);

CREATE INDEX IF NOT EXISTS idx_user_quests_user_date   ON public.user_quests (user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_user_quests_completed   ON public.user_quests (user_id, is_completed, xp_claimed);


CREATE TABLE IF NOT EXISTS public.badge_definitions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_type          text NOT NULL UNIQUE,  -- 'first_log' | 'protein_pro' | 'streak_7' | …
    title               text NOT NULL,
    description         text NOT NULL,
    icon                text NOT NULL DEFAULT 'sparkles',
    xp_reward           int NOT NULL DEFAULT 50,
    requirement_type    text NOT NULL,
    requirement_value   int NOT NULL DEFAULT 1,
    tier                int NOT NULL DEFAULT 1,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.user_badges (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    badge_definition_id uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
    earned_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges (user_id);


CREATE TABLE IF NOT EXISTS public.user_xp (
    user_id             uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_xp            int NOT NULL DEFAULT 0,
    level               int NOT NULL DEFAULT 1,
    current_streak      int NOT NULL DEFAULT 0,
    longest_streak      int NOT NULL DEFAULT 0,
    last_active_date    date,
    quests_completed    int NOT NULL DEFAULT 0,
    badges_earned       int NOT NULL DEFAULT 0,
    updated_at          timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS public.user_daily_activity (
    user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_date       date NOT NULL,
    was_active          boolean NOT NULL DEFAULT false,
    logged_food         boolean NOT NULL DEFAULT false,
    last_active_at      timestamptz,
    last_logged_food_at timestamptz,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_user
    ON public.user_daily_activity (user_id, activity_date DESC);

-- ============================================================
-- SECTION 5: Social
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_follows (
    follower_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower  ON public.user_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON public.user_follows (following_id);

-- ============================================================
-- SECTION 6: Recipes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_recipes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipe_data     jsonb NOT NULL,                        -- full AI-generated recipe JSON
    source          text NOT NULL DEFAULT 'chef',
    is_favorite     boolean NOT NULL DEFAULT false,
    times_cooked    int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_recipes_user
    ON public.saved_recipes (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_favorite
    ON public.saved_recipes (user_id, is_favorite) WHERE is_favorite = true;

-- ============================================================
-- SECTION 7: Weight history
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weight_history (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    weight      numeric NOT NULL,                          -- kg
    recorded_at timestamptz NOT NULL DEFAULT now(),
    notes       text
);

CREATE INDEX IF NOT EXISTS idx_weight_history_user
    ON public.weight_history (user_id, recorded_at DESC);

-- Helper function (mirrors Python calculate_age_from_dob)
CREATE OR REPLACE FUNCTION public.calculate_age_from_dob(dob date)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int;
END; $$;

-- ============================================================
-- SECTION 8: Row Level Security
-- All tables use service-role key from the backend, so RLS is
-- a secondary defence. Enable it but keep policies permissive
-- for the service role.
-- ============================================================


-- Profiles

-- Foods (public readable by authenticated users, write via service role only)

-- Meals

-- User-specific tables: own-data only

-- Follows: read own follows/followers, write own follows

-- ── Promo codes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
    code                    text PRIMARY KEY,              -- e.g. 'AAYU2025'
    label                   text,                          -- human-readable description
    is_special_user         boolean NOT NULL DEFAULT false, -- grants special user flag
    max_uses                integer,                       -- NULL = unlimited
    use_count               integer NOT NULL DEFAULT 0,
    expires_at              timestamptz,                   -- NULL = never expires
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code                    text NOT NULL REFERENCES public.promo_codes(code),
    redeemed_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, code)
);

