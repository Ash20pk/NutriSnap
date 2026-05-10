-- 028_comment_replies.sql
-- Adds threaded comment replies and per-comment reactions (hypes).

-- Replies: self-referential parent_id on post_comments
ALTER TABLE post_comments
    ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES post_comments(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0;

-- Per-comment reactions (heart / hype on individual comments)
CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id UUID        NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_comments_parent   ON post_comments(parent_id)   WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comment_reactions_cmt  ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON comment_reactions(user_id);
