import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import XpPopUp from '../../components/XpPopUp';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

interface ChefRequest {
  ingredients: string[];
  goals: string[];
  cuisine: string;
  dietaryPreference: string;
  targetMeal: string;
  nutritionalGaps: string;
}

interface GeneratedRecipe {
  name: string;
  description: string;
  prepTime: number;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  instructions: string[];
  tips: string;
}

const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Mexican', 
  'Mediterranean', 'Thai', 'Japanese', 'American', 'Continental'
];

const GOAL_OPTIONS = [
  'Weight Loss', 'Muscle Gain', 'Maintain Weight', 'Energy Boost', 
  'Heart Health', 'Better Digestion', 'Immunity', 'Brain Health'
];

const MEAL_TYPES = [
  'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Post-Workout', 'Light Meal'
];

const DIETARY_OPTIONS = [
  'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free', 'Keto', 'Low-Carb'
];

export default function ChefScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null);
  
  // Form state
  const [ingredients, setIngredients] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [selectedDietary, setSelectedDietary] = useState('');
  const [targetMeal, setTargetMeal] = useState('');
  const [showXp, setShowXp] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev => 
      prev.includes(goal) 
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const identifyNutritionalGaps = (todayMeals: any) => {
    // Simple logic to identify what's lacking today
    const totals = todayMeals?.reduce((acc: any, meal: any) => ({
      protein: acc.protein + (meal.total_protein || 0),
      carbs: acc.carbs + (meal.total_carbs || 0),
      fat: acc.fat + (meal.total_fat || 0),
      calories: acc.calories + (meal.total_calories || 0),
    }), { protein: 0, carbs: 0, fat: 0, calories: 0 }) || { protein: 0, carbs: 0, fat: 0, calories: 0 };

    const gaps = [];
    if (totals.protein < 50) gaps.push('protein');
    if (totals.carbs < 100) gaps.push('carbs');
    if (totals.fat < 20) gaps.push('healthy fats');
    if (totals.calories < 1200) gaps.push('calories');
    
    return gaps.join(', ');
  };

  const createChefPrompt = (request: ChefRequest) => {
    return `As a professional chef and nutritionist, create a personalized recipe based on:

Available Ingredients: ${request.ingredients.join(', ')}
Health Goals: ${request.goals.join(', ') || 'General health'}
Preferred Cuisine: ${request.cuisine || 'Any'}
Dietary Preference: ${request.dietaryPreference || 'No restriction'}
Target Meal Type: ${request.targetMeal || 'Any meal'}
Nutritional Gaps to Address: ${request.nutritionalGaps || 'None identified'}

Requirements:
- Use only the listed ingredients or suggest minimal additions
- Focus on Indian cuisine when possible
- Provide clear, step-by-step instructions
- Include prep time and servings
- Calculate approximate nutritional values
- Add cooking tips for beginners

Format response as JSON with: name, description, prepTime, servings, calories, protein, carbs, fat, ingredients (array), instructions (array), tips`;
  };

  const generateRecipe = async () => {
    if (!ingredients.trim()) {
      Alert.alert('Missing Information', 'Please add at least one ingredient you have');
      return;
    }

    setLoading(true);
    try {
      // Get today's nutrition data to identify gaps
      const todayStats = await mealApi.getHistory(user?.id || '', 1);
      const gaps = identifyNutritionalGaps(todayStats.meals[0]);
      
      const prompt = createChefPrompt({
        ingredients: ingredients.split(',').map(i => i.trim()),
        goals: selectedGoals,
        cuisine: selectedCuisine,
        dietaryPreference: selectedDietary,
        targetMeal: targetMeal,
        nutritionalGaps: gaps
      });

      // Call AI to generate recipe
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chef/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      
      const data = await response.json();
      setGeneratedRecipe(data.recipe);
    } catch (error) {
      console.error('Error generating recipe:', error);
      Alert.alert('Error', 'Failed to generate recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogGeneratedRecipe = async () => {
    if (!generatedRecipe || !user) return;

    setLoading(true);
    try {
      await mealApi.logMeal({
        user_id: user.id,
        meal_type: targetMeal.toLowerCase() || 'lunch',
        foods: [{
          name: generatedRecipe.name,
          quantity: 1, // Serving-based
          calories: generatedRecipe.calories,
          protein: generatedRecipe.protein,
          carbs: generatedRecipe.carbs,
          fat: generatedRecipe.fat,
        }],
        logging_method: 'chef',
        notes: `AI Generated Recipe: ${generatedRecipe.description}`,
      });

      // Calculate XP (Bonus XP for following AI Chef: 50 XP)
      setEarnedXp(50);
      setShowXp(true);
      
      // Clear recipe after logging
      setGeneratedRecipe(null);
      setIngredients('');
    } catch (error) {
      console.error('Error logging chef recipe:', error);
      Alert.alert('Error', 'Failed to log the recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader 
        title="AI Chef" 
        subtitle="Personalized recipes for your goals"
      />
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <AnimatedCard delay={100} type="pop" style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickAction} 
            activeOpacity={0.9}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
          >
            <View style={styles.quickActionIconWrap}>
              <Ionicons name="camera" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.quickActionText}>Scan Ingredients</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.quickAction} 
            activeOpacity={0.9}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
          >
            <View style={styles.quickActionIconWrap}>
              <Ionicons name="nutrition" size={24} color={Colors.primary} />
            </View>
            <Text style={styles.quickActionText}>Check Gaps</Text>
          </TouchableOpacity>
        </AnimatedCard>

        {/* Input Form */}
        <View style={styles.form}>

          {/* Ingredients */}
          <AnimatedCard delay={200} type="slide" style={styles.inputSection}>
            <Text style={styles.label}>What ingredients do you have?</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., rice, tomatoes, onions, chicken..."
              value={ingredients}
              onChangeText={setIngredients}
              multiline
            />
            <Text style={styles.hint}>Separate ingredients with commas</Text>
          </AnimatedCard>

          {/* Goals */}
          <AnimatedCard delay={300} type="slide" style={styles.inputSection}>
            <Text style={styles.label}>What are your goals?</Text>
            <View style={styles.optionsGrid}>
              {GOAL_OPTIONS.map(goal => (
                <TouchableOpacity
                  key={goal}
                  style={[
                    styles.optionChip,
                    selectedGoals.includes(goal) && styles.optionChipSelected
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    toggleGoal(goal);
                  }}
                >
                  <Text style={[
                    styles.optionText,
                    selectedGoals.includes(goal) && styles.optionTextSelected
                  ]}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </AnimatedCard>

          {/* Cuisine */}
          <AnimatedCard delay={400} type="slide" style={styles.inputSection}>
            <Text style={styles.label}>Preferred Cuisine</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalOptions}>
                {CUISINE_OPTIONS.map(cuisine => (
                  <TouchableOpacity
                    key={cuisine}
                    style={[
                      styles.optionChip,
                      selectedCuisine === cuisine && styles.optionChipSelected
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedCuisine(cuisine);
                    }}
                  >
                    <Text style={[
                      styles.optionText,
                      selectedCuisine === cuisine && styles.optionTextSelected
                    ]}>
                      {cuisine}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </AnimatedCard>

          {/* Meal Type */}
          <AnimatedCard delay={500} type="slide" style={styles.inputSection}>
            <Text style={styles.label}>Target Meal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalOptions}>
                {MEAL_TYPES.map(meal => (
                  <TouchableOpacity
                    key={meal}
                    style={[
                      styles.optionChip,
                      targetMeal === meal && styles.optionChipSelected
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setTargetMeal(meal);
                    }}
                  >
                    <Text style={[
                      styles.optionText,
                      targetMeal === meal && styles.optionTextSelected
                    ]}>
                      {meal}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </AnimatedCard>

          {/* Dietary Preference */}
          <AnimatedCard delay={600} type="slide" style={styles.inputSection}>
            <Text style={styles.label}>Dietary Preference</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalOptions}>
                {DIETARY_OPTIONS.map(diet => (
                  <TouchableOpacity
                    key={diet}
                    style={[
                      styles.optionChip,
                      selectedDietary === diet && styles.optionChipSelected
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setSelectedDietary(diet);
                    }}
                  >
                    <Text style={[
                      styles.optionText,
                      selectedDietary === diet && styles.optionTextSelected
                    ]}>
                      {diet}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </AnimatedCard>

          {/* Generate Button */}
          <AnimatedCard delay={700} type="pop">
            <DuoButton
              title={loading ? 'Creating Recipe...' : 'Generate Recipe'}
              onPress={generateRecipe}
              disabled={loading}
              loading={loading}
              color={Colors.primary}
              size="large"
              style={{ marginTop: 8 }}
            />
          </AnimatedCard>
        </View>

        {/* Generated Recipe */}
        {generatedRecipe && (
          <AnimatedCard delay={100} type="pop" style={styles.recipeResult}>
            <View style={styles.recipeHeader}>
              <Text style={styles.recipeName}>{generatedRecipe.name}</Text>
              <Text style={styles.recipeDescription}>{generatedRecipe.description}</Text>
              
              <View style={styles.recipeStats}>
                <View style={styles.stat}>
                  <Ionicons name="time" size={20} color={Colors.textSecondary} />
                  <Text style={styles.statText}>{generatedRecipe.prepTime} min</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="people" size={20} color={Colors.textSecondary} />
                  <Text style={styles.statText}>{generatedRecipe.servings} servings</Text>
                </View>
                <View style={styles.stat}>
                  <Ionicons name="flame" size={20} color={Colors.textSecondary} />
                  <Text style={styles.statText}>{generatedRecipe.calories} cal</Text>
                </View>
              </View>
            </View>

            <View style={styles.recipeSection}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              {generatedRecipe.ingredients.map((ingredient, index) => (
                <Text key={index} style={styles.ingredient}>• {ingredient}</Text>
              ))}
            </View>

            <View style={styles.recipeSection}>
              <Text style={styles.sectionTitle}>Instructions</Text>
              {generatedRecipe.instructions.map((instruction, index) => (
                <View key={index} style={styles.instruction}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                  <Text style={styles.instructionText}>{instruction}</Text>
                </View>
              ))}
            </View>

            <View style={styles.recipeSection}>
              <Text style={styles.sectionTitle}>Nutrition</Text>
              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{generatedRecipe.protein}g</Text>
                  <Text style={styles.nutritionLabel}>Protein</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{generatedRecipe.carbs}g</Text>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{generatedRecipe.fat}g</Text>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {generatedRecipe.tips && (
              <View style={styles.recipeSection}>
                <Text style={styles.sectionTitle}>Chef&apos;s Tips</Text>
                <Text style={styles.tips}>{generatedRecipe.tips}</Text>
              </View>
            )}

            <DuoButton
              title="Log This Meal"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                handleLogGeneratedRecipe();
              }}
              disabled={loading}
              loading={loading}
              color={Colors.primary}
              size="medium"
              style={{ marginTop: 8 }}
            />
          </AnimatedCard>
        )}

        {showXp && (
          <XpPopUp xp={earnedXp} onComplete={() => setShowXp(false)} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    alignItems: 'center',
    gap: 8,
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  form: {
    marginBottom: 32,
  },
  chefBubble: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 32,
  },
  chefAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 4,
  },
  chefEmoji: {
    fontSize: 24,
  },
  bubbleContent: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  bubbleText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 20,
  },
  inputSection: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    fontWeight: '700',
    borderBottomWidth: 6,
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  horizontalOptions: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 20,
    paddingBottom: 8,
  },
  optionChip: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 6,
  },
  optionChipSelected: {
    borderColor: Colors.primary,
    borderBottomWidth: 6,
  },
  optionText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  optionTextSelected: {
    color: Colors.primary,
  },
  recipeResult: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    marginBottom: 40,
  },
  recipeHeader: {
    marginBottom: 24,
  },
  recipeName: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  recipeDescription: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: '700',
  },
  recipeStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.backgroundSecondary,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  recipeSection: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ingredient: {
    fontSize: 15,
    color: Colors.text,
    marginBottom: 8,
    paddingLeft: 8,
    fontWeight: '700',
  },
  instruction: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 32,
    fontSize: 16,
    fontWeight: '900',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
    fontWeight: '700',
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  nutritionLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  tips: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
    fontWeight: '700',
    backgroundColor: Colors.backgroundSecondary,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
