-- Migration 012: Add health_insights, bio_alerts, and red_flags to analytics_cache
-- Enhances AI analytics with organ-specific insights, biomarker alerts, and red flags
-- Also renames recommendations to red_flags

ALTER TABLE analytics_cache 
ADD COLUMN IF NOT EXISTS health_insights jsonb NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bio_alerts jsonb NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS red_flags jsonb NOT NULL DEFAULT '[]';

-- Rename recommendations to red_flags (keeping old column for backward compatibility during transition)
-- In production, you may want to migrate data from recommendations to red_flags first

COMMENT ON COLUMN analytics_cache.health_insights IS 'AI-generated organ-specific health insights (heart, liver, kidney, brain, skin)';
COMMENT ON COLUMN analytics_cache.bio_alerts IS 'AI-generated biomarker alerts with status and messages';
COMMENT ON COLUMN analytics_cache.red_flags IS 'AI-generated red flags highlighting problematic patterns (excessive consumption, nutrient overages, etc.)';
