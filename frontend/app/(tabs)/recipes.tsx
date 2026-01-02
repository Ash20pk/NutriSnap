import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 2;

interface Recipe {
  id: string;
  name: string;
  nameHindi: string;
  category: string;
  prepTime: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  instructions: string[];
  isVegetarian: boolean;
  emoji: string;
}

const RECIPES: Recipe[] = [
  {
    id: '1',
    name: 'Dal Tadka',
    nameHindi: 'दाल तड़का',
    category: 'North Indian',
    prepTime: 30,
    servings: 4,
    difficulty: 'easy',
    calories: 180,
    protein: 9,
    carbs: 28,
    fat: 4,
    ingredients: ['Toor dal - 1 cup', 'Onion - 1', 'Tomato - 2', 'Ginger-garlic paste - 1 tsp', 'Cumin seeds - 1 tsp', 'Turmeric - 1/2 tsp', 'Red chili powder - 1 tsp', 'Ghee - 2 tbsp'],
    instructions: ['Pressure cook dal with turmeric', 'Prepare tadka with cumin and spices', 'Add tomatoes and cook', 'Mix with cooked dal', 'Garnish with coriander'],
    isVegetarian: true,
    emoji: '🍲',
  },
  {
    id: '2',
    name: 'Palak Paneer',
    nameHindi: 'पालक पनीर',
    category: 'North Indian',
    prepTime: 25,
    servings: 3,
    difficulty: 'medium',
    calories: 220,
    protein: 12,
    carbs: 10,
    fat: 16,
    ingredients: ['Spinach - 500g', 'Paneer - 200g', 'Onion - 1', 'Tomato - 1', 'Cream - 2 tbsp', 'Garam masala - 1 tsp', 'Ginger-garlic paste - 1 tbsp'],
    instructions: ['Blanch and puree spinach', 'Saute onions and spices', 'Add spinach puree', 'Add paneer cubes', 'Finish with cream'],
    isVegetarian: true,
    emoji: '🥬',
  },
  {
    id: '3',
    name: 'Masala Dosa',
    nameHindi: 'मसाला डोसा',
    category: 'South Indian',
    prepTime: 20,
    servings: 2,
    difficulty: 'medium',
    calories: 280,
    protein: 6,
    carbs: 45,
    fat: 8,
    ingredients: ['Dosa batter - 2 cups', 'Potatoes - 3', 'Onion - 1', 'Green chilies - 2', 'Mustard seeds - 1 tsp', 'Curry leaves', 'Turmeric - 1/2 tsp'],
    instructions: ['Prepare potato masala', 'Heat dosa pan', 'Spread batter thin', 'Add masala filling', 'Fold and serve hot'],
    isVegetarian: true,
    emoji: '🫓',
  },
  {
    id: '4',
    name: 'Chicken Tikka',
    nameHindi: 'चिकन टिक्का',
    category: 'North Indian',
    prepTime: 45,
    servings: 4,
    difficulty: 'medium',
    calories: 240,
    protein: 28,
    carbs: 6,
    fat: 12,
    ingredients: ['Chicken breast - 500g', 'Yogurt - 1 cup', 'Ginger-garlic paste - 2 tbsp', 'Tikka masala - 2 tbsp', 'Lemon juice - 2 tbsp', 'Oil - 2 tbsp'],
    instructions: ['Marinate chicken in yogurt and spices', 'Rest for 30 minutes', 'Skewer chicken pieces', 'Grill or bake at 200°C', 'Serve with mint chutney'],
    isVegetarian: false,
    emoji: '🍗',
  },
  {
    id: '5',
    name: 'Vegetable Upma',
    nameHindi: 'सब्जी उपमा',
    category: 'South Indian',
    prepTime: 15,
    servings: 2,
    difficulty: 'easy',
    calories: 180,
    protein: 5,
    carbs: 32,
    fat: 4,
    ingredients: ['Rava/Semolina - 1 cup', 'Mixed vegetables - 1 cup', 'Onion - 1', 'Mustard seeds - 1 tsp', 'Curry leaves', 'Green chilies - 2'],
    instructions: ['Roast rava until fragrant', 'Prepare tempering', 'Add vegetables and cook', 'Add water and rava', 'Cook until done'],
    isVegetarian: true,
    emoji: '🥘',
  },
  {
    id: '6',
    name: 'Chole Bhature',
    nameHindi: 'छोले भटूरे',
    category: 'North Indian',
    prepTime: 60,
    servings: 4,
    difficulty: 'hard',
    calories: 450,
    protein: 14,
    carbs: 58,
    fat: 18,
    ingredients: ['Chickpeas - 2 cups', 'Flour - 2 cups', 'Yogurt - 1/2 cup', 'Onion - 2', 'Tomatoes - 3', 'Garam masala - 2 tsp', 'Oil for frying'],
    instructions: ['Soak and pressure cook chickpeas', 'Prepare chole masala', 'Make bhature dough', 'Roll and deep fry bhature', 'Serve hot together'],
    isVegetarian: true,
    emoji: '🫘',
  },
];

export default function RecipesScreen() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  const categories = ['All', 'North Indian', 'South Indian'];

  const filteredRecipes = selectedCategory === 'All' 
    ? RECIPES 
    : RECIPES.filter(r => r.category === selectedCategory);

  if (selectedRecipe) {
    return (
      <View style={styles.container}>
        <ScrollView 
          style={styles.detailsContainer}
          contentContainerStyle={styles.detailsContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.detailsHeader}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => setSelectedRecipe(null)}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Recipe Header */}
          <View style={styles.recipeHeader}>
            <Text style={styles.recipeEmoji}>{selectedRecipe.emoji}</Text>
            <Text style={styles.recipeName}>{selectedRecipe.name}</Text>
            <Text style={styles.recipeNameHindi}>{selectedRecipe.nameHindi}</Text>
            
            <View style={styles.recipeMetaRow}>
              <View style={styles.metaItem}>
                <Ionicons name="time" size={16} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{selectedRecipe.prepTime} min</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="people" size={16} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{selectedRecipe.servings} servings</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="bar-chart" size={16} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{selectedRecipe.difficulty}</Text>
              </View>
            </View>
          </View>

          {/* Nutrition Info */}
          <View style={styles.nutritionCard}>
            <Text style={styles.cardTitle}>Nutrition per serving</Text>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{selectedRecipe.calories}</Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: Colors.protein }]}>
                  {selectedRecipe.protein}g
                </Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: Colors.carbs }]}>
                  {selectedRecipe.carbs}g
                </Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: Colors.fat }]}>
                  {selectedRecipe.fat}g
                </Text>
                <Text style={styles.nutritionLabel}>Fat</Text>
              </View>
            </View>
          </View>

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <View style={styles.ingredientsCard}>
              {selectedRecipe.ingredients.map((ingredient, index) => (
                <View key={index} style={styles.ingredientRow}>
                  <View style={styles.ingredientDot} />
                  <Text style={styles.ingredientText}>{ingredient}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <View style={styles.instructionsCard}>
              {selectedRecipe.instructions.map((instruction, index) => (
                <View key={index} style={styles.instructionRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{instruction}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Recipes 👨‍🍳</Text>
          <Text style={styles.subtitle}>Healthy & delicious meals</Text>
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryChip,
              selectedCategory === cat && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === cat && styles.categoryTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recipes Grid */}
      <View style={styles.recipesGrid}>
        {filteredRecipes.map(recipe => (
          <TouchableOpacity
            key={recipe.id}
            style={styles.recipeCard}
            onPress={() => setSelectedRecipe(recipe)}
            activeOpacity={0.9}
          >
            <View style={styles.recipeImageContainer}>
              <Text style={styles.recipeCardEmoji}>{recipe.emoji}</Text>
            </View>
            
            <View style={styles.recipeInfo}>
              <Text style={styles.recipeCardName} numberOfLines={1}>
                {recipe.name}
              </Text>
              <Text style={styles.recipeCardHindi} numberOfLines={1}>
                {recipe.nameHindi}
              </Text>
              
              <View style={styles.recipeCardMeta}>
                <View style={styles.recipeCardMetaItem}>
                  <Ionicons name="time-outline" size={12} color={Colors.textLight} />
                  <Text style={styles.recipeCardMetaText}>{recipe.prepTime}m</Text>
                </View>
                <View style={styles.recipeCardMetaItem}>
                  <Ionicons name="flame-outline" size={12} color={Colors.textLight} />
                  <Text style={styles.recipeCardMetaText}>{recipe.calories}</Text>
                </View>
              </View>

              <View style={styles.macrosRow}>
                <Text style={styles.macroText}>P: {recipe.protein}g</Text>
                <Text style={styles.macroText}>C: {recipe.carbs}g</Text>
                <Text style={styles.macroText}>F: {recipe.fat}g</Text>
              </View>

              {recipe.isVegetarian && (
                <View style={styles.vegBadge}>
                  <Text style={styles.vegBadgeText}>🌱 Veg</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  categoriesContainer: {
    marginBottom: 20,
  },
  categoriesContent: {
    gap: 8,
    paddingRight: 20,
  },
  categoryChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  categoryTextActive: {
    color: Colors.white,
  },
  recipesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recipeCard: {
    width: CARD_WIDTH,
    backgroundColor: Colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  recipeImageContainer: {
    height: 100,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeCardEmoji: {
    fontSize: 50,
  },
  recipeInfo: {
    padding: 12,
  },
  recipeCardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 2,
  },
  recipeCardHindi: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  recipeCardMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  recipeCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeCardMetaText: {
    fontSize: 11,
    color: Colors.textLight,
    fontWeight: '500',
  },
  macrosRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  macroText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vegBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vegBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  // Details Screen
  detailsContainer: {
    flex: 1,
  },
  detailsContent: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  detailsHeader: {
    marginBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  recipeEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  recipeName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  recipeNameHindi: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    gap: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  nutritionCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  ingredientsCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  ingredientText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    fontWeight: '500',
  },
  instructionsCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 16,
  },
  instructionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.white,
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
});