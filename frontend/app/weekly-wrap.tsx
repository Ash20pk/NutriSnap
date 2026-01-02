import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Share,
  Dimensions,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function WeeklyWrapScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchWeeklyStats();
    }
  }, [user]);

  const fetchWeeklyStats = async () => {
    if (!user) return;
    try {
      const history = await mealApi.getHistory(user.id, 7);
      
      let totalCalories = 0;
      let totalProtein = 0;
      let totalCarbs = 0;
      let totalFat = 0;
      let topFoods: { [key: string]: number } = {};
      let mealCounts = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };

      history.meals.forEach((meal: any) => {
        totalCalories += meal.total_calories;
        totalProtein += meal.total_protein;
        totalCarbs += meal.total_carbs;
        totalFat += meal.total_fat;
        
        mealCounts[meal.meal_type as keyof typeof mealCounts] = 
          (mealCounts[meal.meal_type as keyof typeof mealCounts] || 0) + 1;
        
        meal.foods.forEach((food: any) => {
          topFoods[food.name] = (topFoods[food.name] || 0) + 1;
        });
      });

      const topFoodsList = Object.entries(topFoods)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([name]) => name);

      setWeeklyStats({
        totalMeals: history.meals.length,
        avgCalories: Math.round(totalCalories / 7),
        totalProtein: Math.round(totalProtein),
        totalCarbs: Math.round(totalCarbs),
        totalFat: Math.round(totalFat),
        topFoods: topFoodsList,
        mealCounts,
        consistency: Math.round((history.meals.length / 21) * 100), // Out of 3 meals/day
      });
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      const message = `📊 My NutriSnap Weekly Wrap!

🍽️ ${weeklyStats.totalMeals} meals logged
🔥 ${weeklyStats.avgCalories} avg kcal/day
💪 ${weeklyStats.consistency}% consistency

Top foods: ${weeklyStats.topFoods.join(', ')}

Track your nutrition with NutriSnap!`;

      await Share.share({
        message,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Preparing your wrap... 🎁</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark, Colors.accent]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <Ionicons name="close" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.emoji}>📸</Text>
            <Text style={styles.title}>Your Weekly</Text>
            <Text style={styles.titleBold}>NutriSnap</Text>
            <Text style={styles.subtitle}>
              {format(startOfWeek(new Date()), 'MMM d')} - {format(endOfWeek(new Date()), 'MMM d, yyyy')}
            </Text>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsContainer}>
            {/* Total Meals */}
            <View style={styles.statCard}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                  <Text style={styles.statEmoji}>🍽️</Text>
                  <Text style={styles.statValue}>{weeklyStats.totalMeals}</Text>
                  <Text style={styles.statLabel}>Meals Logged</Text>
                </BlurView>
              ) : (
                <View style={[styles.cardBlur, styles.androidBlur]}>
                  <Text style={styles.statEmoji}>🍽️</Text>
                  <Text style={styles.statValue}>{weeklyStats.totalMeals}</Text>
                  <Text style={styles.statLabel}>Meals Logged</Text>
                </View>
              )}
            </View>

            {/* Avg Calories */}
            <View style={styles.statCard}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                  <Text style={styles.statEmoji}>🔥</Text>
                  <Text style={styles.statValue}>{weeklyStats.avgCalories}</Text>
                  <Text style={styles.statLabel}>Avg Calories/Day</Text>
                </BlurView>
              ) : (
                <View style={[styles.cardBlur, styles.androidBlur]}>
                  <Text style={styles.statEmoji}>🔥</Text>
                  <Text style={styles.statValue}>{weeklyStats.avgCalories}</Text>
                  <Text style={styles.statLabel}>Avg Calories/Day</Text>
                </View>
              )}
            </View>

            {/* Consistency */}
            <View style={styles.statCard}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                  <Text style={styles.statEmoji}>🎯</Text>
                  <Text style={styles.statValue}>{weeklyStats.consistency}%</Text>
                  <Text style={styles.statLabel}>Consistency</Text>
                </BlurView>
              ) : (
                <View style={[styles.cardBlur, styles.androidBlur]}>
                  <Text style={styles.statEmoji}>🎯</Text>
                  <Text style={styles.statValue}>{weeklyStats.consistency}%</Text>
                  <Text style={styles.statLabel}>Consistency</Text>
                </View>
              )}
            </View>
          </View>

          {/* Top Foods */}
          <View style={styles.topFoodsCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                <Text style={styles.cardTitle}>🌟 Your Top Foods</Text>
                {weeklyStats.topFoods.map((food: string, index: number) => (
                  <View key={index} style={styles.topFoodItem}>
                    <View style={styles.topFoodRank}>
                      <Text style={styles.topFoodRankText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.topFoodName}>{food}</Text>
                  </View>
                ))}
              </BlurView>
            ) : (
              <View style={[styles.cardBlur, styles.androidBlur]}>
                <Text style={styles.cardTitle}>🌟 Your Top Foods</Text>
                {weeklyStats.topFoods.map((food: string, index: number) => (
                  <View key={index} style={styles.topFoodItem}>
                    <View style={styles.topFoodRank}>
                      <Text style={styles.topFoodRankText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.topFoodName}>{food}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Macros Summary */}
          <View style={styles.macrosCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                <Text style={styles.cardTitle}>📊 Weekly Macros</Text>
                <View style={styles.macrosRow}>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalProtein}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalCarbs}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalFat}g</Text>
                    <Text style={styles.macroLabel}>Fat</Text>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={[styles.cardBlur, styles.androidBlur]}>
                <Text style={styles.cardTitle}>📊 Weekly Macros</Text>
                <View style={styles.macrosRow}>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalProtein}g</Text>
                    <Text style={styles.macroLabel}>Protein</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalCarbs}g</Text>
                    <Text style={styles.macroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.macroItem}>
                    <Text style={styles.macroValue}>{weeklyStats.totalFat}g</Text>
                    <Text style={styles.macroLabel}>Fat</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Motivational Message */}
          <View style={styles.motivationCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={30} tint="light" style={styles.cardBlur}>
                <Text style={styles.motivationEmoji}>🎉</Text>
                <Text style={styles.motivationText}>
                  {weeklyStats.consistency > 80 ? 
                    "Amazing consistency! You're crushing it!" :
                   weeklyStats.consistency > 50 ?
                    "Great job this week! Keep it up!" :
                    "Every meal logged is progress. Let's aim higher next week!"}
                </Text>
              </BlurView>
            ) : (
              <View style={[styles.cardBlur, styles.androidBlur]}>
                <Text style={styles.motivationEmoji}>🎉</Text>
                <Text style={styles.motivationText}>
                  {weeklyStats.consistency > 80 ? 
                    "Amazing consistency! You're crushing it!" :
                   weeklyStats.consistency > 50 ?
                    "Great job this week! Keep it up!" :
                    "Every meal logged is progress. Let's aim higher next week!"}
                </Text>
              </View>
            )}
          </View>

          {/* Share Button */}
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons name="share-social" size={24} color={Colors.white} />
            <Text style={styles.shareButtonText}>Share Your Progress</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '300',
    color: Colors.white,
  },
  titleBold: {
    fontSize: 40,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  statsContainer: {
    marginBottom: 20,
    gap: 16,
  },
  statCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cardBlur: {
    padding: 24,
    alignItems: 'center',
  },
  androidBlur: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  statEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  statValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  topFoodsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 16,
  },
  topFoodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  topFoodRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topFoodRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  topFoodName: {
    fontSize: 16,
    color: Colors.white,
    fontWeight: '500',
  },
  macrosCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  motivationCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  motivationEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  motivationText: {
    fontSize: 18,
    textAlign: 'center',
    color: Colors.white,
    fontWeight: '600',
    lineHeight: 26,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  shareButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
  },
  loadingText: {
    fontSize: 20,
    color: Colors.text,
    textAlign: 'center',
  },
});