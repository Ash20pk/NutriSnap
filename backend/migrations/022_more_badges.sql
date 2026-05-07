-- Migration 022: Expanded badge definitions
-- Adds milestone badges for meal counts, streaks, quests, protein days, and macro days.
-- Also adds breakfast_days requirement_type for early-bird habits.

INSERT INTO badge_definitions (badge_type, title, description, icon, xp_reward, requirement_type, requirement_value, tier)
VALUES
  -- ── Meal count milestones ────────────────────────────────────────────────
  ('hundred_meals',     'Century Logger',    'Log 100 meals',  'nutrition', 150, 'meal_count', 100, 2),
  ('two_fifty_meals',   'Meal Machine',      'Log 250 meals',  'nutrition', 300, 'meal_count', 250, 3),
  ('five_hundred_meals','Iron Logger',       'Log 500 meals',  'nutrition', 500, 'meal_count', 500, 3),

  -- ── Streak milestones ───────────────────────────────────────────────────
  ('streak_14',  'Two-Week Titan',   'Maintain a 14-day logging streak', 'flame', 150, 'streak',  14,  2),
  ('streak_60',  '60-Day Champion',  'Maintain a 60-day logging streak', 'flame', 400, 'streak',  60,  3),
  ('streak_100', 'Century Streak',   '100-day logging streak — legendary!', 'flame', 600, 'streak', 100, 3),

  -- ── Quest milestones ────────────────────────────────────────────────────
  ('quest_25',  'Quest Seeker',  'Complete 25 quests',  'trophy', 125, 'quest_count',  25, 1),
  ('quest_100', 'Quest Legend',  'Complete 100 quests', 'trophy', 400, 'quest_count', 100, 3),

  -- ── Protein days ────────────────────────────────────────────────────────
  -- (protein_3 already exists; adding week and month milestones)
  ('protein_7',  'Protein Week',       'Hit your protein target for 7 days',  'fitness', 150, 'protein_days',  7, 2),
  ('protein_30', 'Protein Powerhouse', 'Hit your protein target for 30 days', 'fitness', 300, 'protein_days', 30, 3),

  -- ── Macro days ──────────────────────────────────────────────────────────
  -- (macro_master already exists at 1 day; adding multi-day tiers)
  ('macro_week',  'Macro Week',   'Hit all macro targets for 7 days',  'pie-chart', 200, 'macro_days',  7, 2),
  ('macro_month', 'Macro Month',  'Hit all macro targets for 30 days', 'pie-chart', 400, 'macro_days', 30, 3),

  -- ── Early bird / breakfast ───────────────────────────────────────────────
  ('early_bird_5',  'Early Bird',    'Log breakfast before 10 am, 5 times',  'sunny',  75, 'breakfast_days',  5, 1),
  ('early_bird_20', 'Morning Person', 'Log breakfast before 10 am, 20 times', 'sunny', 200, 'breakfast_days', 20, 2),

  -- ── Variety / food diversity ─────────────────────────────────────────────
  ('variety_10', 'Explorer',      'Log 10 different foods',  'compass', 75,  'unique_foods', 10, 1),
  ('variety_25', 'Foodie',        'Log 25 different foods',  'compass', 150, 'unique_foods', 25, 2),
  ('variety_50', 'Culinary Hero', 'Log 50 different foods',  'compass', 300, 'unique_foods', 50, 3)

ON CONFLICT (badge_type) DO NOTHING;
