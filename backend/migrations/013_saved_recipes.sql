-- Migration: Add saved_recipes table for Chef feature
-- Allows users to save AI-generated recipes for future reference

CREATE TABLE IF NOT EXISTS saved_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipe_data JSONB NOT NULL, -- Full recipe JSON (name, description, ingredients, instructions, macros, etc.)
    source TEXT DEFAULT 'chef', -- 'chef' | 'manual' | 'imported'
    is_favorite BOOLEAN DEFAULT false,
    times_cooked INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_saved_recipes_user ON saved_recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_favorite ON saved_recipes(user_id, is_favorite) WHERE is_favorite = true;
