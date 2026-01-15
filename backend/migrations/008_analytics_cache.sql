-- Migration 008: Analytics Cache
-- Caches AI-generated analytics to reduce API costs and improve performance

CREATE TABLE IF NOT EXISTS analytics_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    time_range text NOT NULL CHECK (time_range IN ('week', 'month', 'year')),
    
    -- Cached analytics data
    insights jsonb NOT NULL DEFAULT '{}',
    bio_impact jsonb NOT NULL DEFAULT '{}',
    recommendations jsonb NOT NULL DEFAULT '[]',
    
    -- Metadata
    meals_analyzed int NOT NULL DEFAULT 0,
    date_range_start timestamptz NOT NULL,
    date_range_end timestamptz NOT NULL,
    
    -- Cache management
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
    last_refreshed_at timestamptz NOT NULL DEFAULT now(),
    refresh_count int NOT NULL DEFAULT 0,
    
    -- Cost tracking
    tokens_used int NOT NULL DEFAULT 0,
    analysis_duration_ms int NOT NULL DEFAULT 0
);

-- Unique constraint: one cache entry per user per time range
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_cache_user_range 
  ON analytics_cache(user_id, time_range);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_analytics_cache_expires 
  ON analytics_cache(expires_at);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_analytics_cache_user 
  ON analytics_cache(user_id);

COMMENT ON TABLE analytics_cache IS 'Caches AI-generated analytics to reduce API costs and improve performance';
COMMENT ON COLUMN analytics_cache.insights IS 'AI-generated insights about eating patterns, trends, and habits';
COMMENT ON COLUMN analytics_cache.bio_impact IS 'Biological impact analysis (energy, recovery, organ health, etc.)';
COMMENT ON COLUMN analytics_cache.recommendations IS 'Personalized recommendations based on analysis';
COMMENT ON COLUMN analytics_cache.expires_at IS 'Cache TTL - 6 hours for week/month, 24 hours for year';
COMMENT ON COLUMN analytics_cache.tokens_used IS 'OpenAI tokens consumed for this analysis (cost tracking)';
