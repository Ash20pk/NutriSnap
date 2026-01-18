-- Food label reviews: AI-extracted data pending admin approval
-- When approved, data moves to barcodes table and food_health_check_cache

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.food_label_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Submission info
    barcode text NOT NULL,
    submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Product info (from barcode lookup or AI extraction)
    product_name text,
    brand text,

    -- AI-extracted nutrition (per 100g)
    calories_per_100g numeric,
    protein_per_100g numeric,
    carbs_per_100g numeric,
    fat_per_100g numeric,
    fiber_g_per_100g numeric,
    sugar_g_per_100g numeric,
    sodium_mg_per_100g numeric,
    ingredients text,

    -- AI health check result (stored as JSON for flexibility)
    health_check_json jsonb,

    -- Review workflow
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    review_notes text,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_food_label_reviews_barcode ON public.food_label_reviews(barcode);
CREATE INDEX IF NOT EXISTS idx_food_label_reviews_status ON public.food_label_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_label_reviews_submitted_by ON public.food_label_reviews(submitted_by);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_food_label_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS food_label_reviews_updated_at ON public.food_label_reviews;
CREATE TRIGGER food_label_reviews_updated_at
    BEFORE UPDATE ON public.food_label_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_food_label_reviews_updated_at();

-- Comment
COMMENT ON TABLE public.food_label_reviews IS 'Stores AI-extracted nutrition data from user-submitted label photos, pending admin review before being added to the barcodes table';
