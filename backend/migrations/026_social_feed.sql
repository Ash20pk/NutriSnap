-- Social feed events: user-generated posts (photos, badge shares, milestones)
CREATE TABLE IF NOT EXISTS social_feed_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL CHECK (event_type IN ('photo', 'badge', 'streak', 'goal', 'xp_level')),
    title         TEXT NOT NULL,
    body          TEXT,
    photo_url     TEXT,
    metadata      JSONB DEFAULT '{}',
    hype_count    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hype reactions (one per user per post)
CREATE TABLE IF NOT EXISTS feed_post_hypes (
    post_id    UUID NOT NULL REFERENCES social_feed_events(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_events_user_id    ON social_feed_events(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON social_feed_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_hypes_post_id     ON feed_post_hypes(post_id);
