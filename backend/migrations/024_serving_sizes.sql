-- 024_serving_sizes.sql
-- Per-food named serving units (e.g. "1 roti = 35g", "1 katori = 150g").
-- Safe to run multiple times.

SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.food_serving_sizes (
    id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id     uuid             NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    unit_name   text             NOT NULL,  -- canonical key: "piece","katori","cup","tbsp","tsp","medium","large","small","slice","serving"
    unit_label  text             NOT NULL,  -- human label: "1 piece", "1 katori (small bowl)"
    grams       double precision NOT NULL CHECK (grams > 0),
    is_default  boolean          NOT NULL DEFAULT false,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT uq_food_serving_unit UNIQUE (food_id, unit_name)
);

CREATE INDEX IF NOT EXISTS idx_food_serving_sizes_food_id
    ON public.food_serving_sizes (food_id);
