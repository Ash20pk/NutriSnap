import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

export default function HistoryScreen() {
  const { user } = useUser();
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDays, setSelectedDays] = useState(7);

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user, selectedDays]);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await mealApi.getHistory(user.id, selectedDays);
      setMeals(data.meals || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupMealsByDate = (meals: any[]) => {
    const grouped: any = {};
    meals.forEach((meal) => {
      const date = format(new Date(meal.timestamp), 'yyyy-MM-dd');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(meal);
    });
    return grouped;
  };

  const groupedMeals = groupMealsByDate(meals);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Meal History</Text>
        <Text style={styles.subtitle}>Track your nutrition journey</Text>
      </View>

      {/* Time Filter */}
      <View style={styles.filterContainer}>
        {[7, 14, 30].map((days) => (
          <TouchableOpacity
            key={days}
            style={[
              styles.filterButton,
              selectedDays === days && styles.filterButtonActive,
            ]}
            onPress={() => setSelectedDays(days)}
          >
            <Text
              style={[
                styles.filterText,
                selectedDays === days && styles.filterTextActive,
              ]}
            >
              {days === 7 ? 'Week' : days === 14 ? '2 Weeks' : 'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meal History */}
      {Object.keys(groupedMeals).length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="restaurant-outline" size={64} color={Colors.gray300} />
          <Text style={styles.emptyTitle}>No meals logged yet</Text>
          <Text style={styles.emptyText}>
            Start logging your meals to track your nutrition!
          </Text>
        </View>
      ) : (
        Object.keys(groupedMeals)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          .map((date) => (
            <View key={date} style={styles.dateSection}>
              <View style={styles.dateStickyHeader}>
                <Text style={styles.dateText}>
                  {format(new Date(date), 'EEEE, MMMM d')}
                </Text>
                <View style={styles.dateSummary}>
                  <Text style={styles.dateSummaryText}>
                    {groupedMeals[date].reduce(
                      (sum: number, meal: any) => sum + meal.total_calories,
                      0
                    ).toFixed(0)}
                    kcal
                  </Text>
                </View>
              </View>

              {groupedMeals[date].map((meal: any, index: number) => (
                <View key={meal.id || index} style={styles.mealCard}>
                  <View style={styles.mealHeader}>
                    <View style={styles.mealTypeContainer}>
                      <Ionicons
                        name={
                          meal.meal_type === 'breakfast'
                            ? 'sunny'
                            : meal.meal_type === 'lunch'
                            ? 'restaurant'
                            : meal.meal_type === 'dinner'
                            ? 'moon'
                            : 'fast-food'
                        }
                        size={20}
                        color={Colors.primary}
                      />
                      <Text style={styles.mealType}>
                        {meal.meal_type.charAt(0).toUpperCase() + meal.meal_type.slice(1)}
                      </Text>
                    </View>
                    <Text style={styles.mealTime}>
                      {format(new Date(meal.timestamp), 'h:mm a')}
                    </Text>
                  </View>

                  {/* Foods List */}
                  <View style={styles.foodsList}>
                    {meal.foods.map((food: any, foodIndex: number) => (
                      <View key={foodIndex} style={styles.foodItem}>
                        <Text style={styles.foodName}>{food.name}</Text>
                        <Text style={styles.foodDetails}>
                          {food.quantity}g • {Math.round(food.calories)} cal
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Nutrition Summary */}
                  <View style={styles.nutritionSummary}>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionLabel}>Calories</Text>
                      <Text style={styles.nutritionValue}>
                        {Math.round(meal.total_calories)}
                      </Text>
                    </View>
                    <View style={styles.nutritionDivider} />
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionLabel}>Protein</Text>
                      <Text style={styles.nutritionValue}>
                        {Math.round(meal.total_protein)}g
                      </Text>
                    </View>
                    <View style={styles.nutritionDivider} />
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionLabel}>Carbs</Text>
                      <Text style={styles.nutritionValue}>
                        {Math.round(meal.total_carbs)}g
                      </Text>
                    </View>
                    <View style={styles.nutritionDivider} />
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionLabel}>Fat</Text>
                      <Text style={styles.nutritionValue}>
                        {Math.round(meal.total_fat)}g
                      </Text>
                    </View>
                  </View>

                  {/* Logging Method Badge */}
                  <View style={styles.methodBadge}>
                    <Ionicons
                      name={
                        meal.logging_method === 'photo'
                          ? 'camera'
                          : meal.logging_method === 'voice'
                          ? 'mic'
                          : 'create'
                      }
                      size={12}
                      color={Colors.textLight}
                    />
                    <Text style={styles.methodText}>
                      {meal.logging_method === 'photo'
                        ? 'Photo'
                        : meal.logging_method === 'voice'
                        ? 'Voice'
                        : 'Manual'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
      )}

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
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  filterTextActive: {
    color: Colors.white,
  },
  dateSection: {
    marginBottom: 24,
  },
  dateStickyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  dateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  dateSummary: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dateSummaryText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.white,
  },
  mealCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  mealTime: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  foodsList: {
    marginBottom: 12,
  },
  foodItem: {
    marginBottom: 8,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  foodDetails: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  nutritionSummary: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  nutritionLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  methodText: {
    fontSize: 11,
    color: Colors.textLight,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});