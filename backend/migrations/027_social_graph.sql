-- 027_social_graph.sql
-- Proper social graph tables designed for scale.
-- Replaces social_feed_events + feed_post_hypes with a normalized structure.
-- Strategy: pull-on-read feed (fan-out on read) — swap to fan-out on write at ~50k DAU.

-- ── posts ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_type      TEXT         NOT NULL CHECK (post_type IN ('photo','badge','streak','goal','xp_level')),
    caption        TEXT         CHECK (LENGTH(caption) <= 2200),
    metadata       JSONB        NOT NULL DEFAULT '{}',
    reaction_count INT          NOT NULL DEFAULT 0,
    comment_count  INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ
);

-- ── post_media ─────────────────────────────────────────────────────────────
-- Separate table so posts can have multiple media attachments in future.

CREATE TABLE IF NOT EXISTS post_media (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_url   TEXT        NOT NULL,
    media_type  TEXT        NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
    width       INT,
    height      INT,
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── post_reactions ─────────────────────────────────────────────────────────
-- reaction_type allows future emoji reactions (fire, heart, etc.)

CREATE TABLE IF NOT EXISTS post_reactions (
    post_id       UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction_type TEXT        NOT NULL DEFAULT 'hype',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id, reaction_type)
);

-- ── post_comments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_comments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    body        TEXT        NOT NULL CHECK (LENGTH(body) > 0 AND LENGTH(body) <= 2200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

-- ── notifications ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
    notif_type   TEXT        NOT NULL CHECK (notif_type IN ('reaction','comment','follow','badge','streak','mention')),
    post_id      UUID        REFERENCES posts(id) ON DELETE CASCADE,
    comment_id   UUID        REFERENCES post_comments(id) ON DELETE CASCADE,
    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_posts_user_created  ON posts(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created_at    ON posts(created_at DESC)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_post_media_post     ON post_media(post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user ON post_reactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post  ON post_comments(post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recip ON notifications(recipient_id, created_at DESC);

-- ── data migration from social_feed_events ────────────────────────────────

INSERT INTO posts (id, user_id, post_type, caption, metadata, reaction_count, created_at)
SELECT
    id,
    user_id,
    event_type,
    NULLIF(COALESCE(body, title), '') AS caption,
    COALESCE(metadata, '{}')          AS metadata,
    hype_count,
    created_at
FROM social_feed_events
ON CONFLICT (id) DO NOTHING;

INSERT INTO post_media (post_id, media_url, media_type)
SELECT id, photo_url, 'image'
FROM social_feed_events
WHERE photo_url IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO post_reactions (post_id, user_id, reaction_type)
SELECT post_id, user_id, 'hype'
FROM feed_post_hypes
ON CONFLICT DO NOTHING;

-- old tables kept until next release; nothing writes to them after code deploy
