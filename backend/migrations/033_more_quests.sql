-- Add more quest definitions

INSERT INTO quest_definitions (quest_type, title, description, icon, icon_color, xp_reward, target_value, target_unit, difficulty)
VALUES
    -- Meal logging variety
    ('log_all_meals',      'Three-Peat',         'Log breakfast, lunch & dinner',          'trophy',       '#2F593E', 40, 3,   'meals',  'medium'),
    ('log_lunch',          'Midday Fuelled',      'Log your lunch today',                   'partly-sunny', '#F28D35', 15, 1,   'meals',  'easy'),
    ('log_dinner',         'Dinner Done',         'Log your dinner today',                  'moon',         '#5A4A3A', 15, 1,   'meals',  'easy'),
    ('log_snack',          'Smart Snacker',       'Log a snack today',                      'ice-cream',    '#9C27B0', 15, 1,   'meals',  'easy'),
    ('log_meals',          'Quad Logger',         'Log 4 meals today',                      'restaurant',   '#2F593E', 40, 4,   'meals',  'hard'),

    -- Macro & calorie targets
    ('hit_calorie_target', 'Calorie Goal',        'Reach your daily calorie target',        'flame',        '#F28D35', 30, 100, '%',      'medium'),
    ('hit_carbs',          'Carb Up',             'Reach your daily carb target',           'leaf',         '#2F593E', 25, 100, '%',      'medium'),
    ('hit_fat',            'Healthy Fats',        'Reach your daily fat target',            'water',        '#5A4A3A', 25, 100, '%',      'medium'),

    -- Bonus variety / engagement
    ('log_photo',          'Snap & Track',        'Log 2 meals using the camera',           'camera',       '#9C27B0', 25, 2,   'photos', 'medium')

ON CONFLICT DO NOTHING;
