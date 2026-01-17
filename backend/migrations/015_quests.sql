-- Migration 009: Quest System
-- Daily quests, badges/achievements, XP tracking

-- Quest definitions (templates for daily quests)
CREATE TABLE IF NOT EXISTS quest_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_type text NOT NULL,  -- 'log_meals', 'hit_protein', 'hit_calories', 'hit_all_macros', 'log_photo', 'streak'
    title text NOT NULL,
    description text,
    icon text NOT NULL DEFAULT 'checkmark-circle',
    icon_color text NOT NULL DEFAULT '#2F593E',
    xp_reward int NOT NULL DEFAULT 20,
    target_value int NOT NULL DEFAULT 1,  -- e.g., 2 meals, 100g protein
    target_unit text,  -- 'meals', 'g', 'kcal', 'days', null for count
    difficulty text NOT NULL DEFAULT 'easy',  -- 'easy', 'medium', 'hard'
    is_daily boolean NOT NULL DEFAULT true,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- User's daily quest progress
CREATE TABLE IF NOT EXISTS user_quests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    quest_definition_id uuid NOT NULL REFERENCES quest_definitions(id) ON DELETE CASCADE,
    quest_date date NOT NULL DEFAULT CURRENT_DATE,
    current_value double precision NOT NULL DEFAULT 0,
    target_value double precision NOT NULL,
    is_completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    xp_claimed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE(user_id, quest_definition_id, quest_date)
);

CREATE INDEX IF NOT EXISTS idx_user_quests_user_date ON user_quests(user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_user_quests_completed ON user_quests(user_id, is_completed, xp_claimed);

-- Badge definitions (achievements)
CREATE TABLE IF NOT EXISTS badge_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_type text NOT NULL UNIQUE,  -- 'first_log', 'protein_pro', 'streak_3', 'streak_7', 'macro_master', etc.
    title text NOT NULL,
    description text NOT NULL,
    icon text NOT NULL DEFAULT 'sparkles',
    xp_reward int NOT NULL DEFAULT 50,
    requirement_type text NOT NULL,  -- 'meal_count', 'streak', 'quest_count', 'protein_days', 'macro_days'
    requirement_value int NOT NULL DEFAULT 1,
    tier int NOT NULL DEFAULT 1,  -- 1=bronze, 2=silver, 3=gold
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- User earned badges
CREATE TABLE IF NOT EXISTS user_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    badge_definition_id uuid NOT NULL REFERENCES badge_definitions(id) ON DELETE CASCADE,
    earned_at timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE(user_id, badge_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- User XP and level tracking
CREATE TABLE IF NOT EXISTS user_xp (
    user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    total_xp int NOT NULL DEFAULT 0,
    level int NOT NULL DEFAULT 1,
    current_streak int NOT NULL DEFAULT 0,
    longest_streak int NOT NULL DEFAULT 0,
    last_active_date date,
    quests_completed int NOT NULL DEFAULT 0,
    badges_earned int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default quest definitions
INSERT INTO quest_definitions (quest_type, title, description, icon, icon_color, xp_reward, target_value, target_unit, difficulty)
VALUES 
    ('log_meals', 'Log 2 meals', 'Log at least 2 meals today', 'restaurant', '#2F593E', 20, 2, 'meals', 'easy'),
    ('log_meals', 'Log 3 meals', 'Log at least 3 meals today', 'restaurant', '#2F593E', 30, 3, 'meals', 'medium'),
    ('hit_protein', 'Hit protein target', 'Reach your daily protein goal', 'fitness', '#F28D35', 35, 100, '%', 'medium'),
    ('stay_under_calories', 'Stay under calories', 'Stay within your calorie target', 'flame', '#E57373', 25, 100, '%', 'easy'),
    ('hit_all_macros', 'Macro Master', 'Hit all macro targets (±10%)', 'pie-chart', '#4CAF50', 50, 90, '%', 'hard'),
    ('log_photo', 'Photo Logger', 'Log a meal using photo', 'camera', '#9C27B0', 15, 1, 'photos', 'easy'),
    ('log_breakfast', 'Early Bird', 'Log breakfast before 10am', 'sunny', '#FF9800', 20, 1, 'meals', 'easy')
ON CONFLICT DO NOTHING;

-- Seed default badge definitions
INSERT INTO badge_definitions (badge_type, title, description, icon, xp_reward, requirement_type, requirement_value, tier)
VALUES
    ('first_log', 'First Log', 'Log your first meal', 'sparkles', 25, 'meal_count', 1, 1),
    ('ten_meals', 'Getting Started', 'Log 10 meals', 'nutrition', 50, 'meal_count', 10, 1),
    ('fifty_meals', 'Dedicated Logger', 'Log 50 meals', 'nutrition', 100, 'meal_count', 50, 2),
    ('streak_3', 'Streak Starter', 'Achieve a 3-day streak', 'flame', 50, 'streak', 3, 1),
    ('streak_7', 'Week Warrior', 'Achieve a 7-day streak', 'flame', 100, 'streak', 7, 2),
    ('streak_30', 'Monthly Master', 'Achieve a 30-day streak', 'flame', 300, 'streak', 30, 3),
    ('protein_3', 'Protein Pro', 'Hit protein target 3 days', 'fitness', 75, 'protein_days', 3, 1),
    ('macro_master', 'Macro Master', 'Hit all macros in one day', 'pie-chart', 100, 'macro_days', 1, 2),
    ('quest_10', 'Quest Hunter', 'Complete 10 quests', 'trophy', 75, 'quest_count', 10, 1),
    ('quest_50', 'Quest Champion', 'Complete 50 quests', 'trophy', 200, 'quest_count', 50, 2)
ON CONFLICT (badge_type) DO NOTHING;

COMMENT ON TABLE quest_definitions IS 'Template definitions for daily quests';
COMMENT ON TABLE user_quests IS 'User progress on daily quests';
COMMENT ON TABLE badge_definitions IS 'Achievement/badge definitions';
COMMENT ON TABLE user_badges IS 'Badges earned by users';
COMMENT ON TABLE user_xp IS 'User XP, level, and streak tracking';
