import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

export default function AnalyticsScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [macroDistribution, setMacroDistribution] = useState<any[]>([]);
  const [caloriesTrend, setCaloriesTrend] = useState<any[]>([]);
  const [mealTypeBreakdown, setMealTypeBreakdown] = useState<any>({});
  const [averages, setAverages] = useState<any>({});

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const days = timeRange === 'week' ? 7 : 30;
      const history = await mealApi.getHistory(user.id, days);
      
      processWeeklyData(history.meals);
      processMacroDistribution(history.meals);
      processCaloriesTrend(history.meals);
      processMealTypeBreakdown(history.meals);
      calculateAverages(history.meals);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const processWeeklyData = (meals: any[]) => {
    const dayTotals: any = {};
    const days = timeRange === 'week' ? 
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] :
      Array.from({ length: 30 }, (_, i) => (i + 1).toString());

    meals.forEach((meal: any) => {
      const day = timeRange === 'week' ? 
        format(new Date(meal.timestamp), 'EEE') :
        format(new Date(meal.timestamp), 'd');
      
      if (!dayTotals[day]) {
        dayTotals[day] = 0;
      }
      dayTotals[day] += meal.total_calories;
    });

    const chartData = days.map((day, index) => ({
      label: day,
      value: dayTotals[day] || 0,
      frontColor: Colors.primary,
      spacing: index === 0 ? 0 : undefined,
    }));
    setWeeklyData(chartData);
  };

  const processMacroDistribution = (meals: any[]) => {
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    meals.forEach((meal: any) => {
      totalProtein += meal.total_protein || 0;
      totalCarbs += meal.total_carbs || 0;
      totalFat += meal.total_fat || 0;
    });

    const pieData = [
      {
        value: totalProtein,
        color: Colors.protein,
        text: `${Math.round(totalProtein)}g`,
        label: 'Protein',
      },
      {
        value: totalCarbs,
        color: Colors.carbs,
        text: `${Math.round(totalCarbs)}g`,
        label: 'Carbs',
      },
      {
        value: totalFat,
        color: Colors.fat,
        text: `${Math.round(totalFat)}g`,
        label: 'Fat',
      },
    ];
    setMacroDistribution(pieData);
  };

  const processCaloriesTrend = (meals: any[]) => {
    const sortedMeals = [...meals].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const trend = sortedMeals.map((meal, index) => ({
      value: meal.total_calories,
      label: format(new Date(meal.timestamp), 'dd/MM'),
      dataPointText: Math.round(meal.total_calories).toString(),
    }));

    setCaloriesTrend(trend.slice(-7)); // Last 7 entries
  };

  const processMealTypeBreakdown = (meals: any[]) => {
    const breakdown: any = {
      breakfast: { count: 0, calories: 0 },
      lunch: { count: 0, calories: 0 },
      dinner: { count: 0, calories: 0 },
      snack: { count: 0, calories: 0 },
    };

    meals.forEach((meal: any) => {
      const type = meal.meal_type;
      if (breakdown[type]) {
        breakdown[type].count += 1;
        breakdown[type].calories += meal.total_calories;
      }
    });

    setMealTypeBreakdown(breakdown);
  };

  const calculateAverages = (meals: any[]) => {
    if (meals.length === 0) {
      setAverages({ calories: 0, protein: 0, carbs: 0, fat: 0, mealsPerDay: 0 });
      return;
    }

    const days = timeRange === 'week' ? 7 : 30;
    const totalCalories = meals.reduce((sum, m) => sum + m.total_calories, 0);
    const totalProtein = meals.reduce((sum, m) => sum + m.total_protein, 0);
    const totalCarbs = meals.reduce((sum, m) => sum + m.total_carbs, 0);
    const totalFat = meals.reduce((sum, m) => sum + m.total_fat, 0);

    setAverages({
      calories: Math.round(totalCalories / days),
      protein: Math.round(totalProtein / days),
      carbs: Math.round(totalCarbs / days),
      fat: Math.round(totalFat / days),
      mealsPerDay: (meals.length / days).toFixed(1),
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={loading} 
          onRefresh={fetchAnalytics} 
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Analytics 📊</Text>
          <Text style={styles.subtitle}>Your nutrition insights</Text>
        </View>
      </View>

      {/* Time Range Selector */}
      <View style={styles.timeRangeContainer}>
        <TouchableOpacity
          style={[
            styles.timeRangeButton,
            timeRange === 'week' && styles.timeRangeButtonActive,
          ]}
          onPress={() => setTimeRange('week')}
        >
          <Text
            style={[
              styles.timeRangeText,
              timeRange === 'week' && styles.timeRangeTextActive,
            ]}
          >
            Week
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.timeRangeButton,
            timeRange === 'month' && styles.timeRangeButtonActive,
          ]}
          onPress={() => setTimeRange('month')}
        >
          <Text
            style={[
              styles.timeRangeText,
              timeRange === 'month' && styles.timeRangeTextActive,
            ]}
          >
            Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* Average Stats Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Averages</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={28} color={Colors.primary} />
            <Text style={styles.statValue}>{averages.calories}</Text>
            <Text style={styles.statLabel}>kcal/day</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="fitness" size={28} color={Colors.protein} />
            <Text style={styles.statValue}>{averages.protein}g</Text>
            <Text style={styles.statLabel}>Protein</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="leaf" size={28} color={Colors.carbs} />
            <Text style={styles.statValue}>{averages.carbs}g</Text>
            <Text style={styles.statLabel}>Carbs</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="water" size={28} color={Colors.fat} />
            <Text style={styles.statValue}>{averages.fat}g</Text>
            <Text style={styles.statLabel}>Fat</Text>
          </View>
        </View>
      </View>

      {/* Calorie Trend Chart */}
      {weeklyData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calorie Trend</Text>
          <View style={styles.chartCard}>
            <BarChart
              data={weeklyData}
              width={CARD_WIDTH - 60}
              height={200}
              barWidth={timeRange === 'week' ? 32 : 8}
              spacing={timeRange === 'week' ? 16 : 4}
              roundedTop
              roundedBottom
              hideRules
              xAxisThickness={0}
              yAxisThickness={0}
              yAxisTextStyle={{ color: Colors.textLight, fontSize: 10 }}
              noOfSections={4}
              maxValue={Math.max(...weeklyData.map(d => d.value), 2500)}
            />
          </View>
        </View>
      )}

      {/* Macro Distribution Pie Chart */}
      {macroDistribution.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Macro Distribution</Text>
          <View style={styles.pieCard}>
            <PieChart
              data={macroDistribution}
              donut
              radius={90}
              innerRadius={60}
              centerLabelComponent={() => (
                <View style={styles.pieCenter}>
                  <Text style={styles.pieCenterText}>Total</Text>
                  <Text style={styles.pieCenterValue}>Macros</Text>
                </View>
              )}
            />
            <View style={styles.pieLegend}>
              {macroDistribution.map((item, index) => (
                <View key={index} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                  <Text style={styles.legendValue}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Meal Type Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Meal Type Breakdown</Text>
        <View style={styles.mealTypeCard}>
          {Object.entries(mealTypeBreakdown).map(([type, data]: [string, any]) => (
            <View key={type} style={styles.mealTypeRow}>
              <View style={styles.mealTypeInfo}>
                <Ionicons
                  name={
                    type === 'breakfast' ? 'sunny' :
                    type === 'lunch' ? 'restaurant' :
                    type === 'dinner' ? 'moon' : 'fast-food'
                  }
                  size={24}
                  color={Colors.primary}
                />
                <Text style={styles.mealTypeName}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </View>
              <View style={styles.mealTypeStats}>
                <Text style={styles.mealTypeCount}>{data.count} meals</Text>
                <Text style={styles.mealTypeCalories}>
                  {Math.round(data.calories)} kcal
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Insights Card */}
      <View style={styles.insightCard}>
        <View style={styles.insightHeader}>
          <Ionicons name="sparkles" size={24} color={Colors.accent} />
          <Text style={styles.insightTitle}>Smart Insights</Text>
        </View>
        <Text style={styles.insightText}>
          💪 You're averaging {averages.mealsPerDay} meals per day. Great consistency!
        </Text>
        <Text style={styles.insightText}>
          {averages.calories < (user?.daily_calorie_target || 2000) ? 
            "🎯 You're under your calorie target on average. Consider adding nutrient-dense snacks!" :
            "✨ Your calorie intake is on track with your goals!"}
        </Text>
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
  timeRangeContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.primary,
  },
  timeRangeText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  timeRangeTextActive: {
    color: Colors.white,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (width - 52) / 2,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  pieCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
  },
  pieCenter: {
    alignItems: 'center',
  },
  pieCenterText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  pieCenterValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  pieLegend: {
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  legendLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  legendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  mealTypeCard: {
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
  mealTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  mealTypeStats: {
    alignItems: 'flex-end',
  },
  mealTypeCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  mealTypeCalories: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  insightCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.accent + '30',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  insightText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
});