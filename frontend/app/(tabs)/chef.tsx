import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  useWindowDimensions,
  Animated,
  Modal,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../context/UserContext';
import { chefApi } from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

// Goal options
const GOAL_OPTIONS = [
  'Weight Loss',
  'Muscle Gain',
  'Maintenance',
  'Low Carb',
  'High Protein',
  'Balanced',
];

// Cuisine options
const CUISINE_OPTIONS = [
  'Any',
  'Italian',
  'Mexican',
  'Indian',
  'Chinese',
  'Mediterranean',
  'American',
  'Japanese',
  'Thai',
];

// Meal type options with icons
const MEAL_TYPES = [
  { id: 'Breakfast', label: 'Breakfast', icon: 'sunny' },
  { id: 'Lunch', label: 'Lunch', icon: 'restaurant' },
  { id: 'Dinner', label: 'Dinner', icon: 'moon' },
  { id: 'Snack', label: 'Snack', icon: 'fast-food' },
];

// Fun cooking messages for loading state
const COOKING_MESSAGES = [
  "Preheating the AI oven... 🔥",
  "Chopping virtual vegetables... 🥬",
  "Seasoning with algorithms... 🧂",
  "Stirring the data pot... 🥄",
  "Taste-testing the recipe... 👨‍🍳",
  "Adding a pinch of magic... ✨",
  "Plating your masterpiece... 🍽️",
];

export default function ChefScreen() {
  const { user } = useUser();
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(COOKING_MESSAGES[0]);

  // Form state
  const [ingredients, setIngredients] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [targetMeal, setTargetMeal] = useState('');

  // Animation refs
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Calculate responsive card width (2 columns with gap)
  const horizontalPadding = 24;
  const gap = 12;
  const cardWidth = (screenWidth - (horizontalPadding * 2) - gap) / 2;

  // Animate loader when loading
  useEffect(() => {
    if (loading) {
      // Bounce animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: -15,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Rotate animation
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Rotate messages
      let messageIndex = 0;
      const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % COOKING_MESSAGES.length;
        setLoadingMessage(COOKING_MESSAGES[messageIndex]);
      }, 2000);

      return () => {
        clearInterval(messageInterval);
        bounceAnim.stopAnimation();
        rotateAnim.stopAnimation();
        pulseAnim.stopAnimation();
        bounceAnim.setValue(0);
        rotateAnim.setValue(0);
        pulseAnim.setValue(1);
      };
    }
  }, [loading]);

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev =>
      prev.includes(goal)
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  const generateRecipe = async () => {
    if (!ingredients.trim()) {
      Alert.alert('Missing Information', 'Please add at least one ingredient you have');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });

    try {
      const data = await chefApi.generate({
        user_id: user?.id || '',
        ingredients: ingredients.split(',').map(i => i.trim()).filter(Boolean),
        goals: selectedGoals,
        cuisine: selectedCuisine || undefined,
        target_meal: targetMeal || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      router.push({
        pathname: '/chef/result',
        params: { recipe: JSON.stringify(data.recipe) }
      });

    } catch (error) {
      console.error('Error generating recipe:', error);
      Alert.alert('Error', 'Failed to generate recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const HeaderRight = (
    <TouchableOpacity
      style={styles.headerIconBtn}
      onPress={() => {
        Haptics.selectionAsync().catch(() => { });
        router.push('/chef/saved');
      }}
    >
      <Ionicons name="book" size={22} color={Colors.primary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <PageHeader
        title="AI Chef"
        subtitle="Your personal AI culinary expert"
        rightComponent={HeaderRight}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's in your kitchen?</Text>
          {/* Ingredients Input Card */}
          <AnimatedCard delay={100} type="slide" style={styles.inputCard}>

            <TextInput
              style={styles.textInput}
              placeholder="e.g., 400g chicken breast, spinach, garlic, olive oil..."
              value={ingredients}
              onChangeText={setIngredients}
              multiline
              placeholderTextColor={Colors.textSecondary + '80'}
              selectionColor={Colors.primary}
            />
            <Text style={styles.hintText}>Separate ingredients with commas for better results</Text>
          </AnimatedCard>
        </View>

        {/* Meal Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When are you eating?</Text>
          <AnimatedCard delay={150} type="pop" style={styles.mealTypeContainer}>
            {MEAL_TYPES.map((type) => (
              <TouchableOpacity
                key={type.id}
                activeOpacity={0.9}
                style={[
                  styles.mealTypeCard,
                  { width: cardWidth },
                  targetMeal === type.id && styles.mealTypeCardActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => { });
                  setTargetMeal(type.id);
                }}
              >
                <Ionicons
                  name={type.icon as any}
                  size={28}
                  color={targetMeal === type.id ? Colors.primary : Colors.primaryLight}
                />
                <Text
                  style={[
                    styles.mealTypeLabel,
                    targetMeal === type.id && styles.mealTypeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </AnimatedCard>
        </View>

        {/* Health Goals - 2 column grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Health Goal</Text>
          <View style={styles.mealTypeContainer}>
            {GOAL_OPTIONS.map((goal) => (
              <TouchableOpacity
                key={goal}
                activeOpacity={0.9}
                style={[
                  styles.goalCard,
                  { width: cardWidth },
                  selectedGoals.includes(goal) && styles.goalCardActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => { });
                  toggleGoal(goal);
                }}
              >
                <Text style={[
                  styles.goalCardText,
                  selectedGoals.includes(goal) && styles.goalCardTextActive,
                ]}>
                  {goal}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cuisine Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Style of Cooking</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalScroll}
            contentContainerStyle={styles.horizontalScrollContent}
          >
            {CUISINE_OPTIONS.map((cuisine) => (
              <TouchableOpacity
                key={cuisine}
                activeOpacity={0.8}
                style={[
                  styles.cuisineChip,
                  selectedCuisine === cuisine && styles.cuisineChipActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => { });
                  setSelectedCuisine(cuisine);
                }}
              >
                <Text style={[
                  styles.cuisineChipText,
                  selectedCuisine === cuisine && styles.cuisineChipTextActive,
                ]}>
                  {cuisine}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Generate Button */}
        <AnimatedCard delay={300} type="pop" style={styles.actionSection}>
          <DuoButton
            title={loading ? 'Chef is thinking...' : 'Create Recipe'}
            onPress={generateRecipe}
            disabled={loading}
            loading={loading}
            color={Colors.primary}
            size="large"
          />
          <Text style={styles.disclaimerText}>
            Chef will optimize your meal based on your nutritional gaps for today
          </Text>
        </AnimatedCard>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Loading Overlay */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <Animated.View
              style={[
                styles.chefIconContainer,
                {
                  transform: [
                    { translateY: bounceAnim },
                    { rotate: spin },
                    { scale: pulseAnim }
                  ]
                }
              ]}
            >
              <Ionicons name="restaurant" size={48} color={Colors.white} />
            </Animated.View>
            <Text style={styles.loadingTitle}>Chef is Cooking!</Text>
            <Text style={styles.loadingMessage}>{loadingMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },

  // Input Card
  inputCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    flex: 1,
  },
  textInput: {
    fontSize: 16,
    color: Colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
    fontWeight: '600',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 12,
    fontWeight: '700',
    opacity: 0.7,
  },

  // Section
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },

  // Meal Type Grid (like Log page)
  mealTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  mealTypeCard: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 8,
  },
  mealTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    borderBottomWidth: 8,
  },
  mealTypeLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealTypeLabelActive: {
    color: Colors.primary,
  },

  // Goal Cards (2-column grid like meal types)
  goalCard: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 6,
  },
  goalCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    borderBottomWidth: 6,
  },
  goalCardText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  goalCardTextActive: {
    color: Colors.primary,
  },

  // Horizontal Scroll (Cuisine)
  horizontalScroll: {
    marginHorizontal: -24,
  },
  horizontalScrollContent: {
    paddingHorizontal: 24,
    gap: 10,
  },
  cuisineChip: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  cuisineChipActive: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '08',
  },
  cuisineChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  cuisineChipTextActive: {
    color: Colors.secondary,
  },

  // Action Section
  actionSection: {
    alignItems: 'center',
    gap: 16,
  },
  disclaimerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.6,
    maxWidth: '85%',
    lineHeight: 20,
  },

  // Loading Overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(242, 229, 213, 0.95)', // High opacity blur effect using bg color
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    gap: 20,
  },
  chefIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 10,
    borderWidth: 4,
    borderColor: Colors.white,
  },
  loadingTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  loadingMessage: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 24, // Prevent jumping
    opacity: 0.8,
  },
});
