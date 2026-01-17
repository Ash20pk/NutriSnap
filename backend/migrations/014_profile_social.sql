CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio text NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text NULL,
  ADD COLUMN IF NOT EXISTS username text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
  ON profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

-- Efficiently render follower/following lists ordered by most recent
CREATE INDEX IF NOT EXISTS idx_user_follows_follower_created_at
  ON user_follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_follows_following_created_at
  ON user_follows (following_id, created_at DESC);

-- Leaderboards: speed up ORDER BY total_xp DESC
CREATE INDEX IF NOT EXISTS idx_user_xp_total_xp_desc ON user_xp (total_xp DESC);
