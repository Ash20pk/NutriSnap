import React, { useState, useEffect, useCallback } from 'react';
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
import { format } from 'date-fns';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import PageHeader from '../../components/PageHeader';
import AnimatedCard from '../../components/AnimatedCard';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

export default function AnalyticsScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [macroDistribution, setMacroDistribution] = useState<any[]>([]);
  const [mealTypeBreakdown, setMealTypeBreakdown] = useState<any>({});
  const [averages, setAverages] = useState<any>({});
  const [topFoods, setTopFoods] = useState<any[]>([]);
  const [ingredientInsights, setIngredientInsights] = useState<any[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);
  const [selectedFoodDetails, setSelectedFoodDetails] = useState<any>(null);
  const [bioImpact, setBioImpact] = useState<any>({
    energy: 0,
    recovery: 0,
    focus: 0,
    stability: 0,
    antioxidants: 0,
    digestion: 0,
    organEffects: {
      heart: 0,
      liver: 0,
      kidney: 0,
      brain: 0,
      skin: 0,
    },
    negativeDrivers: [],
    driverFoods: {},
    totals: { sugar: 0, sodium: 0, transFat: 0, saturatedFat: 0, additives: 0, dyes: 0, emulsifiers: 0 }
  });

  const processBioImpact = useCallback((meals: any[]) => {
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    let greenCount = 0;
    let fruitCount = 0;
    let lateMealCount = 0;
    let totalSugar = 0;
    let totalSodium = 0;
    let totalTransFat = 0;
    let totalSaturatedFat = 0;
    let additivesCount = 0;
    let dyeCount = 0;
    let emulsifierCount = 0;
    const negativeDrivers: string[] = [];
    const driverFoods: { [key: string]: any[] } = {};

    const addDriver = (driver: string, food: any) => {
      if (!negativeDrivers.includes(driver)) negativeDrivers.push(driver);
      if (!driverFoods[driver]) driverFoods[driver] = [];
      
      const flags = [];
      const sugarVal = food.sugar || 0;
      const sodiumVal = food.sodium || 0;
      const transFatVal = food.trans_fat || 0;
      const nameLower = (food.name || "").toLowerCase();

      if (sugarVal > 15) flags.push({ label: 'High Sugar', value: `${sugarVal}g`, status: 'Critical', desc: 'Hidden sugars cause insulin resistance and energy crashes.' });
      if (sodiumVal > 800) flags.push({ label: 'High Sodium', value: `${sodiumVal}mg`, status: 'Critical', desc: 'Excessive salt causes water retention and high BP.' });
      if (transFatVal > 0) flags.push({ label: 'Trans Fat', value: `${transFatVal}g`, status: 'Critical', desc: 'Highly inflammatory and heart-damaging industrial oil.' });
      if (food.saturated_fat > 10) flags.push({ label: 'Sat. Fat', value: `${food.saturated_fat}g`, status: 'Warning', desc: 'Excessive saturated fat triggers systemic inflammation and slows recovery.' });
      
      if (nameLower.includes('red 40') || nameLower.includes('yellow 5') || nameLower.includes('blue 1') || nameLower.includes('color')) {
        flags.push({ label: 'Artificial Dyes', value: 'Detected', status: 'Warning', desc: 'Synthetic petroleum-based colors linked to hyperactivity.' });
      }
      if (nameLower.includes('gum') || nameLower.includes('lecithin') || nameLower.includes('carrageenan')) {
        flags.push({ label: 'Emulsifiers', value: 'Detected', status: 'Warning', desc: 'Industrial thickeners that can irritate the gut lining.' });
      }
      if (nameLower.includes('diet') || nameLower.includes('zero') || nameLower.includes('aspartame') || nameLower.includes('sucralose')) {
        flags.push({ label: 'Fake Sugars', value: 'Present', status: 'Warning', desc: 'Artificial sweeteners that can confuse metabolic signals.' });
      }
      
      const foodName = food.name || "Unknown Item";
      if (!driverFoods[driver].find(f => f.name === foodName)) {
        driverFoods[driver].push({
          name: foodName,
          flags,
          timestamp: food.timestamp,
          driver
        });
      }
    };

    meals.forEach(meal => {
      totalProtein += meal.total_protein || 0;
      totalCarbs += meal.total_carbs || 0;
      totalFat += meal.total_fat || 0;
      
      const hour = new Date(meal.timestamp).getHours();
      if (hour >= 21) {
        lateMealCount++;
        addDriver('Late Night Eating', { name: format(new Date(meal.timestamp), 'h:mm a') + ' Meal', timestamp: meal.timestamp });
      }

      meal.foods?.forEach((f: any) => {
        const foodWithTime = { ...f, timestamp: meal.timestamp };
        const name = f.name.toLowerCase();
        
        // Accumulate specific "hidden" metrics if available in data
        totalSugar += f.sugar || 0;
        totalSodium += f.sodium || 0;
        totalTransFat += f.trans_fat || 0;
        totalSaturatedFat += f.saturated_fat || 0;

        if (name.includes('salad') || name.includes('spinach') || name.includes('broccoli') || name.includes('kale')) greenCount++;
        if (name.includes('berry') || name.includes('apple') || name.includes('orange') || name.includes('fruit')) fruitCount++;
        
        // Track negative drivers
        if (name.includes('soda') || name.includes('sugar') || name.includes('cookie') || name.includes('cake') || name.includes('candy') || (f.sugar > 15)) {
          addDriver('High Sugar Foods', foodWithTime);
        }
        if (name.includes('fried') || name.includes('burger') || name.includes('pizza') || name.includes('fast food') || (f.sodium > 800)) {
          addDriver('Processed Sodium', foodWithTime);
        }
        if (name.includes('fried') || name.includes('donut') || name.includes('margarine')) {
          addDriver('Processed Fats', foodWithTime);
        }
        if (name.includes('white bread') || name.includes('pasta') || name.includes('pastry') || name.includes('white rice')) {
          addDriver('Refined Carbs', foodWithTime);
        }
        if (name.includes('diet') || name.includes('light') || name.includes('zero') || name.includes('sweetener')) {
          additivesCount++;
          addDriver('Artificial Sweeteners', foodWithTime);
        }
        if (name.includes('color') || name.includes('red 40') || name.includes('yellow 5') || name.includes('blue 1')) {
          dyeCount++;
          addDriver('Artificial Dyes', foodWithTime);
        }
        if (name.includes('gum') || name.includes('lecithin') || name.includes('carrageenan')) {
          emulsifierCount++;
          addDriver('Hidden Emulsifiers', foodWithTime);
        }
      });
    });

    const total = totalProtein + totalCarbs + totalFat || 1;
    const proteinRatio = totalProtein / total;
    const carbRatio = totalCarbs / total;

    // Calculate Organ Effects (0-100 score)
    const heartScore = Math.max(0, 100 - (totalSodium / 100) - (totalTransFat * 10) - (totalSaturatedFat / 2));
    const liverScore = Math.max(0, 100 - (totalSugar / 2) - (additivesCount * 5) - (totalTransFat * 15));
    const kidneyScore = Math.max(0, 100 - (totalSodium / 150) - (totalProtein > 200 ? (totalProtein - 200) / 2 : 0));
    const brainScore = Math.max(0, 100 - (totalSugar / 3) - (dyeCount * 15) + (greenCount * 2));
    const skinScore = Math.max(0, 100 - (totalSugar / 2) - (totalSaturatedFat / 3) + (fruitCount * 3));

    setBioImpact({
      energy: Math.min(100, Math.round(carbRatio * 150 + (greenCount * 5))),
      recovery: Math.min(100, Math.round(proteinRatio * 250)),
      focus: Math.min(100, Math.round((proteinRatio + (totalFat / total)) * 100 + 20 - (dyeCount * 10))),
      stability: Math.min(100, Math.round(100 - (carbRatio * 50) + (greenCount * 3))),
      antioxidants: Math.min(100, (greenCount + fruitCount) * 10),
      digestion: Math.max(0, 100 - (lateMealCount * 20) - (emulsifierCount * 5)),
      organEffects: {
        heart: Math.round(heartScore),
        liver: Math.round(liverScore),
        kidney: Math.round(kidneyScore),
        brain: Math.round(brainScore),
        skin: Math.round(skinScore),
      },
      negativeDrivers,
      driverFoods,
      totals: {
        sugar: Math.round(totalSugar),
        sodium: Math.round(totalSodium),
        transFat: totalTransFat.toFixed(1),
        saturatedFat: Math.round(totalSaturatedFat),
        additives: additivesCount,
        dyes: dyeCount,
        emulsifiers: emulsifierCount
      }
    });
  }, []);

  const processTopFoods = useCallback((meals: any[]) => {
    const foodCounts: any = {};
    const ingredientCounts: any = {};

    meals.forEach((meal: any) => {
      meal.foods?.forEach((food: any) => {
        // Process foods
        if (!foodCounts[food.name]) {
          foodCounts[food.name] = { count: 0, calories: 0, name: food.name };
        }
        foodCounts[food.name].count += 1;
        foodCounts[food.name].calories += food.calories || 0;

        // Process ingredients (if they exist in the meal data)
        food.ingredients?.forEach((ing: any) => {
          const ingName = typeof ing === 'string' ? ing : ing.name;
          if (!ingredientCounts[ingName]) {
            ingredientCounts[ingName] = { count: 0, name: ingName };
          }
          ingredientCounts[ingName].count += 1;
        });
      });
    });

    const sortedFoods = Object.values(foodCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);
    setTopFoods(sortedFoods);

    const sortedIngredients = Object.values(ingredientCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 4);
    setIngredientInsights(sortedIngredients);
  }, []);

  const processWeeklyData = useCallback((meals: any[]) => {
    const dayTotals: any = {};
    const monthsInYear = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let chartData: any[] = [];

    if (timeRange === 'week') {
      // Last 7 days rolling
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return format(d, 'EEE');
      });

      meals.forEach((meal: any) => {
        const day = format(new Date(meal.timestamp), 'EEE');
        dayTotals[day] = (dayTotals[day] || 0) + meal.total_calories;
      });

      chartData = last7Days.map((day) => ({
        label: day,
        value: dayTotals[day] || 0,
        frontColor: (day === 'Sat' || day === 'Sun') ? Colors.primary + '80' : Colors.primary,
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 10,
          fontWeight: '900',
          width: 45,
          textAlign: 'center',
        },
      }));
    } else if (timeRange === 'month') {
      // 30 days grouped by week (Week on Week)
      const weekTotals: number[] = [0, 0, 0, 0];
      const now = new Date();
      
      meals.forEach((meal: any) => {
        const mealDate = new Date(meal.timestamp);
        const diffDays = Math.floor((now.getTime() - mealDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays < 7) weekTotals[3] += meal.total_calories;
        else if (diffDays < 14) weekTotals[2] += meal.total_calories;
        else if (diffDays < 21) weekTotals[1] += meal.total_calories;
        else if (diffDays < 28) weekTotals[0] += meal.total_calories;
      });

      chartData = weekTotals.map((total, i) => ({
        label: `Week ${i + 1}`,
        value: total,
        frontColor: Colors.primary,
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 10,
          fontWeight: '900',
          width: 60,
          textAlign: 'center',
        },
      }));
    } else {
      // Annual view by month (Jan, Feb, etc.)
      meals.forEach((meal: any) => {
        const month = format(new Date(meal.timestamp), 'MMM');
        dayTotals[month] = (dayTotals[month] || 0) + meal.total_calories;
      });
      chartData = monthsInYear.map((month) => ({
        label: month,
        value: dayTotals[month] || 0,
        frontColor: Colors.primary,
        labelTextStyle: {
          color: Colors.textSecondary,
          fontSize: 10,
          fontWeight: '900',
          width: 45,
          textAlign: 'center',
        },
      }));
    }

    setWeeklyData(chartData);
  }, [timeRange]);

  const processMacroDistribution = useCallback((meals: any[]) => {
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    meals.forEach((meal: any) => {
      totalProtein += meal.total_protein || 0;
      totalCarbs += meal.total_carbs || 0;
      totalFat += meal.total_fat || 0;
    });

    const total = totalProtein + totalCarbs + totalFat || 1;
    const proteinRatio = totalProtein / total;
    const carbRatio = totalCarbs / total;
    const fatRatio = totalFat / total;

    const pieData = [
      {
        value: totalProtein || 1,
        color: Colors.protein,
        text: `${Math.round(proteinRatio * 100)}%`,
        label: 'Protein',
        amountText: `${Math.round(totalProtein)}g`,
      },
      {
        value: totalCarbs || 1,
        color: Colors.carbs,
        text: `${Math.round(carbRatio * 100)}%`,
        label: 'Carbs',
        amountText: `${Math.round(totalCarbs)}g`,
      },
      {
        value: totalFat || 1,
        color: Colors.fat,
        text: `${Math.round(fatRatio * 100)}%`,
        label: 'Fat',
        amountText: `${Math.round(totalFat)}g`,
      },
    ];
    setMacroDistribution(pieData);
  }, []);

  const processMealTypeBreakdown = useCallback((meals: any[]) => {
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
  }, []);

  const calculateAverages = useCallback((meals: any[]) => {
    if (meals.length === 0) {
      setAverages({ calories: 0, protein: 0, carbs: 0, fat: 0, mealsPerDay: 0 });
      return;
    }

    const daysForFetch = timeRange === 'week' ? 7 : (timeRange === 'month' ? 30 : 365);
    const totalCalories = meals.reduce((sum, m) => sum + m.total_calories, 0);
    const totalProtein = meals.reduce((sum, m) => sum + m.total_protein, 0);
    const totalCarbs = meals.reduce((sum, m) => sum + m.total_carbs, 0);
    const totalFat = meals.reduce((sum, m) => sum + m.total_fat, 0);

    const loggedDays = new Set(meals.map(m => format(new Date(m.timestamp), 'yyyy-MM-dd'))).size;
    const daysForAverage = loggedDays || 1;

    const calorieTarget = user?.daily_calorie_target || 2000;
    const consistencyScore = Math.min(100, Math.round((loggedDays / daysForFetch) * 100));

    setAverages({
      calories: Math.round(totalCalories / daysForAverage),
      protein: Math.round(totalProtein / daysForAverage),
      carbs: Math.round(totalCarbs / daysForAverage),
      fat: Math.round(totalFat / daysForAverage),
      mealsPerDay: (meals.length / daysForAverage).toFixed(1),
      consistencyScore,
      isHighProtein: (totalProtein / (totalProtein + totalCarbs + totalFat || 1)) > 0.3,
      isUnderTarget: Math.round(totalCalories / daysForAverage) < calorieTarget,
    });
  }, [timeRange, user?.daily_calorie_target]);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 7 days for week, 30 for month, 365 days for annual (Jan, Feb...)
      let days = 7;
      if (timeRange === 'month') days = 30;
      else if (timeRange === 'year') days = 365;
      
      const history = await mealApi.getHistory(user.id, days);
      
      processWeeklyData(history.meals);
      processMacroDistribution(history.meals);
      processMealTypeBreakdown(history.meals);
      processTopFoods(history.meals);
      processBioImpact(history.meals);
      calculateAverages(history.meals);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [user, timeRange, processWeeklyData, processMacroDistribution, processMealTypeBreakdown, calculateAverages, processTopFoods, processBioImpact]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, fetchAnalytics]);

  const hasAnyMacros = macroDistribution.some(d => d.value > 1); // 1 is the fallback value in processMacroDistribution

  const isBioImpactOptimized = bioImpact.stability >= 70 && bioImpact.recovery >= 70 && bioImpact.digestion >= 70 && bioImpact.antioxidants >= 50;

  return (
    <View style={styles.container}>
      <PageHeader 
        title="Analytics" 
        subtitle="Your nutrition insights"
      />
      <ScrollView
        style={styles.scrollView}
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
        <View style={styles.timeRangeContainer}>
          <TouchableOpacity
            style={[
              styles.timeRangeButton,
              timeRange === 'week' && styles.timeRangeButtonActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setTimeRange('week');
            }}
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
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setTimeRange('month');
            }}
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
          <TouchableOpacity
            style={[
              styles.timeRangeButton,
              timeRange === 'year' && styles.timeRangeButtonActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setTimeRange('year');
            }}
          >
            <Text
              style={[
                styles.timeRangeText,
                timeRange === 'year' && styles.timeRangeTextActive,
              ]}
            >
              Year
            </Text>
          </TouchableOpacity>
        </View>

        <AnimatedCard delay={100} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Averages</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="flame" size={28} color={Colors.primary} />
              <Text style={styles.statValue}>{averages.calories || 0}</Text>
              <Text style={styles.statLabel}>kcal/day</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="fitness" size={28} color={Colors.protein} />
              <Text style={styles.statValue}>{averages.protein || 0}g</Text>
              <Text style={styles.statLabel}>Protein</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="leaf" size={28} color={Colors.carbs} />
              <Text style={styles.statValue}>{averages.carbs || 0}g</Text>
              <Text style={styles.statLabel}>Carbs</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="water" size={28} color={Colors.fat} />
              <Text style={styles.statValue}>{averages.fat || 0}g</Text>
              <Text style={styles.statLabel}>Fat</Text>
            </View>
          </View>
        </AnimatedCard>

        {weeklyData.length > 0 && (
          <AnimatedCard delay={200} type="slide" style={styles.section}>
            <Text style={styles.sectionTitle}>Calorie Trend</Text>
            <View style={styles.chartCard}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 20 }}
              >
                <View style={styles.chartWrapper}>
                  <BarChart
                    data={weeklyData}
                    width={timeRange === 'week' ? CARD_WIDTH - 40 : (timeRange === 'month' ? CARD_WIDTH - 40 : CARD_WIDTH * 2)}
                    height={200}
                    barWidth={timeRange === 'week' ? 32 : (timeRange === 'month' ? 40 : 28)}
                    spacing={timeRange === 'week' ? 24 : (timeRange === 'month' ? 30 : 22)}
                    roundedTop
                    roundedBottom
                    hideRules
                    xAxisThickness={0}
                    yAxisThickness={0}
                    yAxisTextStyle={{ 
                      color: Colors.textLight, 
                      fontSize: 10, 
                      fontWeight: '800',
                      textAlign: 'right',
                    }}
                    yAxisLabelWidth={35}
                    noOfSections={4}
                    maxValue={Math.max(...weeklyData.map(d => d.value), 2500)}
                    initialSpacing={24}
                    xAxisLabelTextStyle={{
                      color: Colors.textSecondary,
                      fontSize: 10,
                      fontWeight: '900',
                      textAlign: 'center',
                    }}
                    hideYAxisText={false}
                    showValuesAsTopLabel
                    topLabelTextStyle={{
                      color: Colors.textSecondary,
                      fontSize: 9,
                      fontWeight: '900',
                    }}
                    barInnerComponent={(item: any) => (
                      item.value === 0 ? (
                        <View style={styles.hollowBar} />
                      ) : null
                    )}
                  />
                </View>
              </ScrollView>
            </View>
          </AnimatedCard>
        )}

        <AnimatedCard delay={300} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Macro Distribution</Text>
          <View style={styles.pieCard}>
            <View style={styles.pieChartWrapper}>
              <PieChart
                data={hasAnyMacros ? macroDistribution : [{ value: 1, color: Colors.border }]}
                radius={90}
                backgroundColor="transparent"
                showText
                textColor={Colors.white}
                textSize={14}
                fontWeight="900"
              />
            </View>
            <View style={styles.pieLegend}>
              {macroDistribution.map((item, index) => (
                <View key={index} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                  <Text style={styles.legendValue}>{hasAnyMacros ? (item.amountText ?? '0g') : '0g'}</Text>
                </View>
              ))}
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard delay={400} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Meal Type Breakdown</Text>
          <View style={styles.mealTypeCard}>
            {Object.entries(mealTypeBreakdown).map(([type, data]: [string, any]) => (
              <View key={type} style={styles.mealTypeRow}>
                <View style={styles.mealTypeInfo}>
                  <View style={[styles.mealTypeIconContainer, { backgroundColor: 
                    type === 'breakfast' ? '#FF9F0A20' :
                    type === 'lunch' ? '#30B0C720' :
                    type === 'dinner' ? '#5856D620' : '#FF3B3020'
                  }]}>
                    <Ionicons
                      name={
                        type === 'breakfast' ? 'sunny' :
                        type === 'lunch' ? 'restaurant' :
                        type === 'dinner' ? 'moon' : 'fast-food'
                      }
                      size={20}
                      color={
                        type === 'breakfast' ? '#FF9F0A' :
                        type === 'lunch' ? '#30B0C7' :
                        type === 'dinner' ? '#5856D6' : '#FF3B30'
                      }
                    />
                  </View>
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
        </AnimatedCard>

        <AnimatedCard delay={425} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Top Foods</Text>
          <View style={styles.topFoodsCard}>
            {topFoods.length > 0 ? (
              topFoods.map((food, index) => (
                <View key={index} style={styles.foodRow}>
                  <View style={styles.foodInfo}>
                    <View style={styles.foodRank}>
                      <Text style={styles.foodRankText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.foodName} numberOfLines={1}>{food.name}</Text>
                  </View>
                  <View style={styles.foodStats}>
                    <Text style={styles.foodCount}>{food.count}x</Text>
                    <Text style={styles.foodCalories}>{Math.round(food.calories / food.count)} kcal</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyFoods}>
                <Ionicons name="fast-food-outline" size={32} color={Colors.border} />
                <Text style={styles.emptyFoodsText}>No food data yet</Text>
              </View>
            )}
          </View>
        </AnimatedCard>

        {ingredientInsights.length > 0 && (
          <AnimatedCard delay={475} type="slide" style={styles.section}>
            <Text style={styles.sectionTitle}>Frequent Ingredients</Text>
            <View style={styles.ingredientsCard}>
              <View style={styles.ingredientsGrid}>
                {ingredientInsights.map((ing, index) => (
                  <View key={index} style={styles.ingredientBadge}>
                    <Ionicons name="leaf-outline" size={14} color={Colors.primary} />
                    <Text style={styles.ingredientBadgeText}>{ing.name}</Text>
                    <View style={styles.ingCountBadge}>
                      <Text style={styles.ingCountText}>{ing.count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </AnimatedCard>
        )}

        <AnimatedCard delay={500} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Health Insights</Text>
          <View style={styles.healthInsightsCard}>
            <View style={styles.organGrid}>
              {[
                { label: 'Heart', score: bioImpact.organEffects.heart, icon: 'heart', color: '#FF2D55' },
                { label: 'Liver', score: bioImpact.organEffects.liver, icon: 'shield-checkmark', color: '#34C759' },
                { label: 'Kidney', score: bioImpact.organEffects.kidney, icon: 'water', color: '#5AC8FA' },
                { label: 'Brain', score: bioImpact.organEffects.brain, icon: 'flash', color: '#FF9500' },
                { label: 'Skin', score: bioImpact.organEffects.skin, icon: 'sparkles', color: '#AF52DE' },
              ].map((organ, index) => (
                <View key={index} style={styles.organItem}>
                  <View style={[styles.organIconContainer, { backgroundColor: organ.color + '15' }]}>
                    <Ionicons name={organ.icon as any} size={20} color={organ.color} />
                  </View>
                  <View style={styles.organInfo}>
                    <View style={styles.organHeader}>
                      <Text style={styles.organLabel}>{organ.label}</Text>
                      <Text style={[styles.organScore, { color: organ.score < 50 ? '#FF3B30' : (organ.score < 80 ? '#FF9500' : '#34C759') }]}>
                        {organ.score}%
                      </Text>
                    </View>
                    <View style={styles.organProgressBg}>
                      <View 
                        style={[
                          styles.organProgressFill, 
                          { 
                            width: `${organ.score}%`, 
                            backgroundColor: organ.score < 50 ? '#FF3B30' : (organ.score < 80 ? '#FF9500' : '#34C759') 
                          }
                        ]} 
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </AnimatedCard>

        <AnimatedCard delay={550} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>{isBioImpactOptimized ? 'Body Optimized' : 'Bio-Impact Alerts'}</Text>
          <View style={styles.bioImpactCard}>
            <View style={styles.bioGrid}>
              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#FF950020' }]}>
                  <Ionicons name="flash" size={20} color="#FF9500" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Energy Levels</Text>
                    <Text style={styles.bioValueText}>{bioImpact.energy}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.energy}%`, backgroundColor: '#FF9500' }]} />
                  </View>
                </View>
              </View>

              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#FF2D5520' }]}>
                  <Ionicons name="barbell" size={20} color="#FF2D55" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Muscle Recovery</Text>
                    <Text style={styles.bioValueText}>{bioImpact.recovery}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.recovery}%`, backgroundColor: '#FF2D55' }]} />
                  </View>
                </View>
              </View>

              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#5856D620' }]}>
                  <Ionicons name="eye" size={20} color="#5856D6" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Mental Focus</Text>
                    <Text style={styles.bioValueText}>{bioImpact.focus}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.focus}%`, backgroundColor: '#5856D6' }]} />
                  </View>
                </View>
              </View>

              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#34C75920' }]}>
                  <Ionicons name="pulse" size={20} color="#34C759" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Sugar Stability</Text>
                    <Text style={styles.bioValueText}>{bioImpact.stability}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.stability}%`, backgroundColor: '#34C759' }]} />
                  </View>
                </View>
              </View>

              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#AF52DE20' }]}>
                  <Ionicons name="leaf" size={20} color="#AF52DE" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Antioxidant Load</Text>
                    <Text style={styles.bioValueText}>{bioImpact.antioxidants}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.antioxidants}%`, backgroundColor: '#AF52DE' }]} />
                  </View>
                </View>
              </View>

              <View style={styles.bioItem}>
                <View style={[styles.bioIconBg, { backgroundColor: '#5AC8FA20' }]}>
                  <Ionicons name="water" size={20} color="#5AC8FA" />
                </View>
                <View style={styles.bioInfo}>
                  <View style={styles.bioLabelRow}>
                    <Text style={styles.bioLabel}>Digestive Ease</Text>
                    <Text style={styles.bioValueText}>{bioImpact.digestion}%</Text>
                  </View>
                  <View style={styles.bioProgressBg}>
                    <View style={[styles.bioProgressFill, { width: `${bioImpact.digestion}%`, backgroundColor: '#5AC8FA' }]} />
                  </View>
                </View>
              </View>
            </View>
            
            <View style={[styles.bioCorrectiveInsights, isBioImpactOptimized && { borderStyle: 'solid', borderColor: '#34C75940' }]}>
              <Text style={styles.correctiveTitle}>{isBioImpactOptimized ? 'System Optimized' : 'Corrective Actions'}</Text>
              
              {bioImpact.stability < 70 && (
                <TouchableOpacity 
                  style={styles.correctiveItem}
                  onPress={() => setSelectedIssue({
                    title: 'Energy Spikes Detected',
                    impact: 'Sugar Stability',
                    score: bioImpact.stability,
                    drivers: bioImpact.negativeDrivers.filter((d: string) => d.includes('Sugar') || d.includes('Eating') || d.includes('Sweeteners')),
                    culpritFoods: Array.from(new Map([...(bioImpact.driverFoods['High Sugar Foods'] || []), ...(bioImpact.driverFoods['Artificial Sweeteners'] || []), ...(bioImpact.driverFoods['Late Night Eating'] || [])].map(f => [f.name + f.timestamp, f])).values()),
                    solution: 'Your blood glucose is fluctuating too much. This causes brain fog and afternoon energy crashes. Switch to complex carbs like oats, quinoa, or sweet potatoes, and always pair them with protein.',
                    hiddenLabels: [
                      { label: 'Total Added Sugar', value: `${bioImpact.totals.sugar}g`, status: 'Critical', desc: `You consumed ${bioImpact.totals.sugar}g of sugar. The WHO recommends < 25g/day. High sugar causes insulin resistance and fatty liver.` },
                      { label: 'Hidden Sweeteners', value: bioImpact.totals.additives > 0 ? 'Detected' : 'None', status: bioImpact.totals.additives > 0 ? 'Warning' : 'Good', desc: 'Aspartame and Sucralose can disrupt your gut microbiome and actually increase sugar cravings.' },
                      { label: 'Glycemic Load', value: 'High', status: 'Alert', desc: 'Refined carbs without fiber enter the bloodstream instantly, triggering massive insulin spikes.' }
                    ]
                  })}
                >
                  <Ionicons name="warning" size={20} color="#FF9500" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.correctiveText}>Energy Spikes Detected</Text>
                    <Text style={styles.correctiveSubText}>Your meal timing or carb ratios are causing instability. Tap for details.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              
              {bioImpact.recovery < 70 && (
                <TouchableOpacity 
                  style={styles.correctiveItem}
                  onPress={() => setSelectedIssue({
                    title: 'Recovery Deficit',
                    impact: 'Muscle Recovery',
                    score: bioImpact.recovery,
                    drivers: bioImpact.negativeDrivers.filter((d: string) => d.includes('Protein') || d.includes('Sodium') || d.includes('Processed')),
                    culpritFoods: Array.from(new Map([...(bioImpact.driverFoods['Processed Sodium'] || []), ...(bioImpact.driverFoods['Processed Fats'] || [])].map(f => [f.name + f.timestamp, f])).values()),
                    solution: 'Your muscles aren\'t getting enough amino acids to repair efficiently after activity. This can lead to chronic soreness and metabolic slowdown. Aim for 25-30g of protein in your next 3 meals.',
                    hiddenLabels: [
                      { label: 'Sodium Load', value: `${bioImpact.totals.sodium}mg`, status: bioImpact.totals.sodium > 2300 ? 'Critical' : 'Warning', desc: `You consumed ${bioImpact.totals.sodium}mg. Excessive sodium causes cellular dehydration and masks muscle definition.` },
                      { label: 'Saturated Fat', value: `${bioImpact.totals.saturatedFat}g`, status: 'Warning', desc: 'High saturated fat from processed meats triggers systemic inflammation, slowing down muscle recovery.' },
                      { label: 'Trans Fats', value: `${bioImpact.totals.transFat}g`, status: parseFloat(bioImpact.totals.transFat) > 0 ? 'Critical' : 'Good', desc: 'Found in fried foods, trans fats damage blood vessels and block nutrient delivery to muscles.' }
                    ]
                  })}
                >
                  <Ionicons name="barbell" size={20} color="#FF2D55" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.correctiveText}>Recovery Deficit</Text>
                    <Text style={styles.correctiveSubText}>Protein intake is below the threshold for optimal repair. Tap for details.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}

              {bioImpact.focus < 70 && (
                <TouchableOpacity 
                  style={styles.correctiveItem}
                  onPress={() => setSelectedIssue({
                    title: 'Brain Fog Alert',
                    impact: 'Mental Focus',
                    score: bioImpact.focus,
                    drivers: bioImpact.negativeDrivers.filter((d: string) => d.includes('Dyes') || d.includes('Sugar') || d.includes('Processed')),
                    culpritFoods: Array.from(new Map([...(bioImpact.driverFoods['Artificial Dyes'] || []), ...(bioImpact.driverFoods['High Sugar Foods'] || [])].map(f => [f.name + f.timestamp, f])).values()),
                    solution: 'Artificial additives and refined sugars cross the blood-brain barrier and cause neuro-inflammation. This leads to the "foggy" feeling. Boost your focus with Omega-3 fats (walnuts, salmon) and staying hydrated.',
                    hiddenLabels: [
                      { label: 'Artificial Dyes', value: bioImpact.totals.dyes > 0 ? 'Detected' : 'None', status: 'Critical', desc: 'Red 40 and Yellow 5 are linked to hyperactivity and reduced attention span in both children and adults.' },
                      { label: 'Maltodextrin', value: 'High Prob.', status: 'Warning', desc: 'A common thickener with a higher glycemic index than table sugar. It causes rapid brain energy crashes.' }
                    ]
                  })}
                >
                  <Ionicons name="eye" size={20} color="#5856D6" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.correctiveText}>Brain Fog Alert</Text>
                    <Text style={styles.correctiveSubText}>Your focus score is declining. Tap to see the hidden culprits.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}

              {bioImpact.digestion < 70 && (
                <TouchableOpacity 
                  style={styles.correctiveItem}
                  onPress={() => setSelectedIssue({
                    title: 'Sleep/Digestion Conflict',
                    impact: 'Digestive Ease',
                    score: bioImpact.digestion,
                    drivers: bioImpact.negativeDrivers.filter((d: string) => d.includes('Night') || d.includes('Processed') || d.includes('Emulsifiers')),
                    culpritFoods: Array.from(new Map([...(bioImpact.driverFoods['Late Night Eating'] || []), ...(bioImpact.driverFoods['Hidden Emulsifiers'] || [])].map(f => [f.name + f.timestamp, f])).values()),
                    solution: 'Eating heavy meals too close to sleep forces your body to focus on digestion rather than cellular repair. This degrades sleep quality and metabolic health. Try a "kitchen closed" rule after 8 PM.',
                    hiddenLabels: [
                      { label: 'Nighttime Sodium', value: `${Math.round(bioImpact.totals.sodium * 0.4)}mg`, status: 'Warning', desc: 'Consuming high sodium at night causes water retention and makes you wake up feeling "puffy" and dehydrated.' },
                      { label: 'Digestive Inhibitors', value: bioImpact.totals.additives > 0 ? 'Present' : 'None', status: 'Alert', desc: 'Emulsifiers and artificial thickeners in processed foods can irritate the gut lining, causing bloating.' }
                    ]
                  })}
                >
                  <Ionicons name="moon" size={20} color="#5AC8FA" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.correctiveText}>Sleep/Digestion Conflict</Text>
                    <Text style={styles.correctiveSubText}>Late-night meals are straining your metabolism. Tap for details.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}

              {bioImpact.antioxidants < 50 && (
                <TouchableOpacity 
                  style={styles.correctiveItem}
                  onPress={() => setSelectedIssue({
                    title: 'Low Micronutrient Diversity',
                    impact: 'Antioxidant Load',
                    score: bioImpact.antioxidants,
                    drivers: ['Lack of plant diversity', 'Refined processed foods'],
                    culpritFoods: Array.from(new Map([...(bioImpact.driverFoods['Refined Carbs'] || []), ...(bioImpact.driverFoods['Processed Fats'] || [])].map(f => [f.name + f.timestamp, f])).values()),
                    solution: 'Antioxidants protect your cells from oxidative stress. A lack of these can lead to faster aging and higher inflammation. Try the "Rainbow Rule": include 3 different colored plants in your next meal.',
                    hiddenLabels: [
                      { label: 'Phytochemical Gap', value: 'Critical', status: 'Critical', desc: 'Your log shows very low intake of flavonoids and carotenoids found in colorful produce.' },
                      { label: 'Synthetic Preservatives', value: 'High', status: 'Warning', desc: 'Hidden BHA/BHT in packaged snacks can increase oxidative stress, requiring even MORE antioxidants to neutralize.' }
                    ]
                  })}
                >
                  <Ionicons name="leaf" size={20} color="#AF52DE" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.correctiveText}>Low Micronutrient Diversity</Text>
                    <Text style={styles.correctiveSubText}>Missing key antioxidants. Tap for details.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}

              {isBioImpactOptimized && (
                <View style={styles.correctiveItem}>
                  <Ionicons name="checkmark-circle" size={24} color="#34C759" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.correctiveText, { color: '#1A1C1E' }]}>Perfect Biological Balance</Text>
                    <Text style={styles.correctiveSubText}>Your current nutrition profile is supporting all core functions perfectly. Your body is in peak state!</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </AnimatedCard>

        {selectedIssue && (
          <View style={styles.modalOverlay}>
            <AnimatedCard type="pop" style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedIssue.title}</Text>
                <TouchableOpacity onPress={() => setSelectedIssue(null)}>
                  <Ionicons name="close-circle" size={28} color={Colors.border} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalBody}>
                <View style={styles.modalStatRow}>
                  <View>
                    <Text style={styles.modalStatLabel}>Impacted Area</Text>
                    <Text style={styles.modalStatValue}>{selectedIssue.impact}</Text>
                  </View>
                  <View style={styles.modalScoreCircle}>
                    <Text style={styles.modalScoreText}>{selectedIssue.score}%</Text>
                  </View>
                </View>

                {selectedIssue.drivers?.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Negative Drivers</Text>
                    <View style={styles.driverTags}>
                      {selectedIssue.drivers.map((driver: string, i: number) => (
                        <View key={i} style={styles.driverTag}>
                          <Ionicons name="trending-down" size={14} color="#FF3B30" />
                          <Text style={styles.driverTagText}>{driver}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {selectedIssue.culpritFoods?.length > 0 && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Culprit Foods</Text>
                    <View style={styles.culpritGrid}>
                      {selectedIssue.culpritFoods.map((food: any, i: number) => (
                        <TouchableOpacity 
                          key={i} 
                          style={styles.culpritBadge}
                          onPress={() => setSelectedFoodDetails(food)}
                        >
                          <View style={styles.culpritHeader}>
                            <Ionicons name="close-circle" size={16} color="#FF3B30" />
                            <Text style={styles.culpritText} numberOfLines={1}>{food.name}</Text>
                          </View>
                          <View style={styles.culpritFooter}>
                            <Text style={styles.culpritTime}>{food.timestamp ? format(new Date(food.timestamp), 'h:mm a') : 'Today'}</Text>
                            <Ionicons name="chevron-forward" size={12} color="#FF3B30" />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>The Fix</Text>
                  <Text style={styles.solutionText}>{selectedIssue.solution}</Text>
                </View>

                {selectedIssue.hiddenLabels && (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Label Red Flags</Text>
                    <View style={styles.labelGrid}>
                      {selectedIssue.hiddenLabels.map((item: any, i: number) => (
                        <View key={i} style={styles.labelCard}>
                          <View style={styles.labelHeader}>
                            <Text style={styles.labelText}>{item.label}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: item.status === 'Critical' ? '#FF3B3020' : '#FF950020' }]}>
                              <Text style={[styles.statusText, { color: item.status === 'Critical' ? '#FF3B30' : '#FF9500' }]}>{item.status}</Text>
                            </View>
                          </View>
                          <Text style={styles.labelValue}>{item.value}</Text>
                          <Text style={styles.labelDesc}>{item.desc}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <TouchableOpacity 
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedIssue(null)}
                >
                  <Text style={styles.modalCloseBtnText}>Got it!</Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          </View>
        )}

        {selectedFoodDetails && (
          <View style={[styles.modalOverlay, { zIndex: 1100 }]}>
            <AnimatedCard type="pop" style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedFoodDetails.name}</Text>
                  <Text style={styles.modalSubtitle}>{selectedFoodDetails.driver} culprit</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedFoodDetails(null)}>
                  <Ionicons name="close-circle" size={28} color={Colors.border} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {selectedFoodDetails.flags?.length > 0 ? (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Flagged Components</Text>
                    <View style={styles.labelGrid}>
                      {selectedFoodDetails.flags.map((flag: any, i: number) => (
                        <View key={i} style={styles.labelCard}>
                          <View style={styles.labelHeader}>
                            <Text style={styles.labelText}>{flag.label}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: '#FF3B3020' }]}>
                              <Text style={[styles.statusText, { color: '#FF3B30' }]}>{flag.status}</Text>
                            </View>
                          </View>
                          <Text style={styles.labelValue}>{flag.value}</Text>
                          <Text style={styles.labelDesc}>{flag.desc}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Why this food?</Text>
                    <Text style={styles.solutionText}>
                      This item was flagged because it contains processed ingredients, hidden sweeteners, or was eaten at a time that disrupts your biological rhythm.
                    </Text>
                  </View>
                )}

                <TouchableOpacity 
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedFoodDetails(null)}
                >
                  <Text style={styles.modalCloseBtnText}>Close Details</Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          </View>
        )}

        <View style={{ height: 100 }} />
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
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 6,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: Colors.primary,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeRangeTextActive: {
    color: Colors.white,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  premiumText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  insightsHero: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  consistencyRing: {
    alignItems: 'center',
    marginRight: 24,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  heroStats: {
    flex: 1,
    gap: 16,
  },
  heroStatItem: {
    gap: 4,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subSectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textSecondary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  organCompactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  organIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organRight: {
    flex: 1,
  },
  organRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  organLabelCompact: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  organScoreCompact: {
    fontSize: 12,
    fontWeight: '900',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (width - 60) / 2,
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    overflow: 'hidden',
  },
  pieCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    alignItems: 'center',
  },
  pieChartWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 180,
    height: 180,
  },
  hollowPieWrapper: {
    borderRadius: 90,
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: 10,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chartWrapper: {
    paddingLeft: 0,
    paddingRight: 0,
    overflow: 'visible',
  },
  hollowBar: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
    borderBottomColor: Colors.border,
    borderRadius: 8,
    marginHorizontal: 1,
  },
  pieCenter: {
    alignItems: 'center',
  },
  pieCenterText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pieCenterValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  pieLegend: {
    width: '100%',
    marginTop: 24,
    gap: 14,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  legendLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  legendValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  mealTypeCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    gap: 18,
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
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  mealTypeStats: {
    alignItems: 'flex-end',
  },
  mealTypeCount: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  mealTypeCalories: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  topFoodsCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    gap: 14,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  foodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  foodRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodRankText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primary,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  foodStats: {
    alignItems: 'flex-end',
  },
  foodCount: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  foodCalories: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  ingredientsCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  ingredientsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ingredientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    gap: 6,
  },
  ingredientBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  ingCountBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ingCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.white,
  },
  emptyFoods: {
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  emptyFoodsText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textLight,
  },
  mealTypeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthInsightsCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  organGrid: {
    gap: 16,
  },
  organItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  organIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  organInfo: {
    flex: 1,
  },
  organHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  organLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  organScore: {
    fontSize: 12,
    fontWeight: '900',
  },
  organProgressBg: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  organProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  organFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  organFooterText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  insightProgressBg: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  insightProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  insightCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.primary + '40',
    borderBottomWidth: 8,
    marginBottom: 24,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  bioImpactCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  bioGrid: {
    gap: 16,
  },
  bioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bioIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bioInfo: {
    flex: 1,
  },
  bioLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 4,
  },
  bioProgressBg: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bioProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  bioValueText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.textSecondary,
  },
  bioCorrectiveInsights: {
    marginTop: 24,
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
    gap: 16,
  },
  correctiveTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  correctiveItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  correctiveText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 18,
  },
  correctiveSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 4,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: 24,
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    flex: 1,
    paddingRight: 16,
  },
  modalBody: {
    gap: 20,
  },
  modalStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalStatLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  modalScoreCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalScoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.white,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  driverTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  driverTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF3B3010',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B3020',
  },
  driverTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF3B30',
  },
  culpritGrid: {
    gap: 10,
  },
  culpritBadge: {
    backgroundColor: '#FF3B3008',
    padding: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FF3B3015',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  culpritHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  culpritText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  culpritFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  culpritTime: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
    opacity: 0.7,
  },
  labelGrid: {
    gap: 12,
  },
  labelCard: {
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  labelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  labelValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  labelDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  solutionText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  modalCloseBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  modalCloseBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  insightTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
    fontWeight: '700',
  },
});
