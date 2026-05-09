import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { mealApi, analyticsApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import PageHeader from '../../components/PageHeader';
import AnimatedCard from '../../components/AnimatedCard';
import StandardBarChart from '../../components/StandardBarChart';
import StandardDonutChart from '../../components/StandardDonutChart';
import AppCard from '../../components/AppCard';
import SectionTitle from '../../components/SectionTitle';
import EmptyState from '../../components/EmptyState';
import HydrationTracker from '../../components/HydrationTracker';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const InsightHeader = ({ title, insight }: { title: string; insight?: string }) => {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View>
      <TouchableOpacity
        activeOpacity={insight ? 0.7 : 1}
        onPress={insight ? toggle : undefined}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: expanded ? 12 : 16
        }}
      >
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{title}</Text>
        {insight && (
          <Ionicons
            name={expanded ? "chevron-up" : "sparkles"}
            size={18}
            color={theme.primary}
          />
        )}
      </TouchableOpacity>
      {expanded && insight && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.insightText, { marginBottom: 0 }]}>{insight}</Text>
        </View>
      )}
    </View>
  );
};

const CollapsibleBioAlert = ({ alert }: { alert: any }) => {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const getStatusColor = () => {
    if (alert.status === 'critical') return Colors.error;
    if (alert.status === 'warning') return Colors.warning;
    return Colors.success;
  };

  const statusColor = getStatusColor();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggle}
      style={styles.alertCard}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.alertIconBox, { backgroundColor: statusColor + '15', borderColor: statusColor + '30' }]}>
          <Ionicons
            name={alert.status === 'critical' ? 'warning' : (alert.status === 'warning' ? 'alert-circle' : 'checkmark-circle')}
            size={20}
            color={statusColor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.alertTitle} numberOfLines={expanded ? 0 : 1}>
            {alert.metric}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.textSecondary}
        />
      </View>

      {expanded && (
        <View style={{ marginTop: 12, paddingLeft: 48 }}>
          <Text style={styles.alertBody}>
            {alert.message}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const CollapsibleRedFlag = ({ flag }: { flag: any }) => {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const getStatusColor = () => {
    if (flag.severity === 'critical') return Colors.error;
    return Colors.warning;
  };

  const statusColor = getStatusColor();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggle}
      style={styles.alertCard}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.alertIconBox, { backgroundColor: statusColor + '15', borderColor: statusColor + '30' }]}>
          <Ionicons
            name={flag.severity === 'critical' ? 'alert-circle' : 'warning'}
            size={20}
            color={statusColor}
          />
        </View>
        <Text style={[styles.alertTitle, { flex: 1 }]} numberOfLines={expanded ? 0 : 1}>
          {flag.title}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={theme.textSecondary}
        />
      </View>

      {expanded && (
        <View style={{ marginTop: 12, paddingLeft: 48 }}>
          <Text style={styles.alertBody}>
            {flag.description}
          </Text>
          {flag.culprit_foods && flag.culprit_foods.length > 0 && (
            <View style={styles.redFlagCulprits}>
              <Text style={styles.redFlagCulpritsLabel}>Culprit Foods:</Text>
              <View style={styles.redFlagCulpritsList}>
                {flag.culprit_foods.map((food: string, idx: number) => (
                  <View key={idx} style={[styles.redFlagCulpritBadge, { borderColor: statusColor + '30', backgroundColor: statusColor + '10' }]}>
                    <Text style={[styles.redFlagCulpritText, { color: statusColor }]}>{food}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {flag.frequency && (
            <Text
              style={styles.redFlagFrequency}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Frequency: {truncateWords(flag.frequency, 6)}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const truncateWords = (text: unknown, maxWords: number) => {
  if (typeof text !== 'string') return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
};

// Type definitions for analytics data
interface OrganEffects {
  heart?: number;
  liver?: number;
  kidney?: number;
  brain?: number;
  skin?: number;
  [key: string]: number | undefined;
}

interface ApiBioImpact {
  energy?: number;
  recovery?: number;
  focus?: number;
  stability?: number;
  antioxidants?: number;
  digestion?: number;
  organ_effects?: OrganEffects;
  [key: string]: number | OrganEffects | undefined;
}

export default function AnalyticsScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { user } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [periodMealCount, setPeriodMealCount] = useState(0);
  const [macroDistribution, setMacroDistribution] = useState<any[]>([]);
  const [mealTypeBreakdown, setMealTypeBreakdown] = useState<any>({});
  const [averages, setAverages] = useState<any>({});
  const [microAverages, setMicroAverages] = useState<any>({
    sodium_mg: 0,
    sugar_g: 0,
    fiber_g: 0,
    saturated_fat_g: 0,
    trans_fat_g: 0,
    cholesterol_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0,
    iron_mg: 0,
    magnesium_mg: 0,
    phosphorus_mg: 0,
    zinc_mg: 0,
    copper_mg: 0,
    manganese_mg: 0,
    selenium_ug: 0,
    vitamin_a_ug: 0,
    vitamin_c_mg: 0,
    vitamin_d_ug: 0,
    vitamin_e_mg: 0,
    vitamin_k_ug: 0,
    thiamin_b1_mg: 0,
    riboflavin_b2_mg: 0,
    niacin_b3_mg: 0,
    vitamin_b6_mg: 0,
    folate_ug: 0,
    vitamin_b12_ug: 0,
    caffeine_mg: 0,
    alcohol_g: 0,
  });
  const [topFoods, setTopFoods] = useState<any[]>([]);
  const [ingredientInsights, setIngredientInsights] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
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
  });

  const resetAiSections = useCallback(() => {
    setAiAnalysis(null);
    setBioImpact({
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
        frontColor: theme.primary,
        gradientColor: theme.primaryLight,
        showGradient: true,
        labelTextStyle: {
          color: theme.textSecondary,
          fontSize: 10,
          fontWeight: '900',
          width: 45,
          textAlign: 'center',
        },
      }));
    } else if (timeRange === 'month') {
      // 30 days grouped into 5 buckets (last bucket may be partial)
      const weekTotals: number[] = [0, 0, 0, 0, 0];
      const now = new Date();

      meals.forEach((meal: any) => {
        const mealDate = new Date(meal.timestamp);
        const diffDays = Math.floor((now.getTime() - mealDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 7) weekTotals[4] += meal.total_calories;
        else if (diffDays < 14) weekTotals[3] += meal.total_calories;
        else if (diffDays < 21) weekTotals[2] += meal.total_calories;
        else if (diffDays < 28) weekTotals[1] += meal.total_calories;
        else if (diffDays < 30) weekTotals[0] += meal.total_calories;
      });

      chartData = weekTotals.map((total, i) => ({
        label: i === 0 ? 'Days 29-30' : `Week ${i}`,
        value: total,
        frontColor: theme.primary,
        gradientColor: theme.primaryLight,
        showGradient: true,
        labelTextStyle: {
          color: theme.textSecondary,
          fontSize: 10,
          fontWeight: '900',
          width: 60,
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
        gradientCenterColor: Colors.protein,
      },
      {
        value: totalCarbs || 1,
        color: Colors.carbs,
        text: `${Math.round(carbRatio * 100)}%`,
        label: 'Carbs',
        amountText: `${Math.round(totalCarbs)}g`,
        gradientCenterColor: Colors.carbs,
      },
      {
        value: totalFat || 1,
        color: Colors.fat,
        text: `${Math.round(fatRatio * 100)}%`,
        label: 'Fat',
        amountText: `${Math.round(totalFat)}g`,
        gradientCenterColor: Colors.fat,
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
      setMicroAverages({
        sodium_mg: 0,
        sugar_g: 0,
        fiber_g: 0,
        saturated_fat_g: 0,
        trans_fat_g: 0,
        cholesterol_mg: 0,
        potassium_mg: 0,
        calcium_mg: 0,
        iron_mg: 0,
        magnesium_mg: 0,
        phosphorus_mg: 0,
        zinc_mg: 0,
        copper_mg: 0,
        manganese_mg: 0,
        selenium_ug: 0,
        vitamin_a_ug: 0,
        vitamin_c_mg: 0,
        vitamin_d_ug: 0,
        vitamin_e_mg: 0,
        vitamin_k_ug: 0,
        thiamin_b1_mg: 0,
        riboflavin_b2_mg: 0,
        niacin_b3_mg: 0,
        vitamin_b6_mg: 0,
        folate_ug: 0,
        vitamin_b12_ug: 0,
        caffeine_mg: 0,
        alcohol_g: 0,
      });
      return;
    }

    const daysForFetch = timeRange === 'week' ? 7 : (timeRange === 'month' ? 30 : 365);
    const validMeals = meals.filter((m: any) => {
      const cals = Number(m?.total_calories || 0);
      const p = Number(m?.total_protein || 0);
      const cb = Number(m?.total_carbs || 0);
      const f = Number(m?.total_fat || 0);
      return cals > 0 || p > 0 || cb > 0 || f > 0;
    });

    const totalCalories = validMeals.reduce((sum: number, m: any) => sum + Number(m.total_calories || 0), 0);
    const totalProtein = validMeals.reduce((sum: number, m: any) => sum + Number(m.total_protein || 0), 0);
    const totalCarbs = validMeals.reduce((sum: number, m: any) => sum + Number(m.total_carbs || 0), 0);
    const totalFat = validMeals.reduce((sum: number, m: any) => sum + Number(m.total_fat || 0), 0);

    const loggedDays = new Set(validMeals.map((m: any) => format(new Date(m.timestamp), 'yyyy-MM-dd'))).size;
    const daysForAverage = Math.max(1, loggedDays); // Use actual logged days, not full time range

    const calorieTarget = user?.daily_calorie_target || 2000;
    const consistencyScore = Math.min(100, Math.round((loggedDays / daysForFetch) * 100));

    setAverages({
      calories: Math.round(totalCalories / daysForAverage),
      protein: Math.round(totalProtein / daysForAverage),
      carbs: Math.round(totalCarbs / daysForAverage),
      fat: Math.round(totalFat / daysForAverage),
      mealsPerDay: (validMeals.length / Math.max(1, loggedDays)).toFixed(1),
      consistencyScore,
      isHighProtein: (totalProtein / (totalProtein + totalCarbs + totalFat || 1)) > 0.3,
      isUnderTarget: Math.round(totalCalories / daysForAverage) < calorieTarget,
    });

    let sodiumMg = 0, sugarG = 0, fiberG = 0, saturatedFatG = 0, transFatG = 0, cholesterolMg = 0;
    let potassiumMg = 0, calciumMg = 0, ironMg = 0, magnesiumMg = 0, phosphorusMg = 0;
    let zincMg = 0, copperMg = 0, manganeseMg = 0, seleniumUg = 0;
    let vitaminAUg = 0, vitaminCMg = 0, vitaminDUg = 0, vitaminEMg = 0, vitaminKUg = 0;
    let thiaminB1Mg = 0, riboflavinB2Mg = 0, niacinB3Mg = 0, vitaminB6Mg = 0;
    let folateUg = 0, vitaminB12Ug = 0, caffeineMg = 0, alcoholG = 0;

    validMeals.forEach((m: any) => {
      const micros = m?.micros || {};
      sodiumMg += Number(micros.sodium_mg || 0);
      sugarG += Number(micros.sugar_g || 0);
      fiberG += Number(micros.fiber_g || 0);
      saturatedFatG += Number(micros.saturated_fat_g || 0);
      transFatG += Number(micros.trans_fat_g || 0);
      cholesterolMg += Number(micros.cholesterol_mg || 0);
      potassiumMg += Number(micros.potassium_mg || 0);
      calciumMg += Number(micros.calcium_mg || 0);
      ironMg += Number(micros.iron_mg || 0);
      magnesiumMg += Number(micros.magnesium_mg || 0);
      phosphorusMg += Number(micros.phosphorus_mg || 0);
      zincMg += Number(micros.zinc_mg || 0);
      copperMg += Number(micros.copper_mg || 0);
      manganeseMg += Number(micros.manganese_mg || 0);
      seleniumUg += Number(micros.selenium_ug || 0);
      vitaminAUg += Number(micros.vitamin_a_ug || 0);
      vitaminCMg += Number(micros.vitamin_c_mg || 0);
      vitaminDUg += Number(micros.vitamin_d_ug || 0);
      vitaminEMg += Number(micros.vitamin_e_mg || 0);
      vitaminKUg += Number(micros.vitamin_k_ug || 0);
      thiaminB1Mg += Number(micros.thiamin_b1_mg || 0);
      riboflavinB2Mg += Number(micros.riboflavin_b2_mg || 0);
      niacinB3Mg += Number(micros.niacin_b3_mg || 0);
      vitaminB6Mg += Number(micros.vitamin_b6_mg || 0);
      folateUg += Number(micros.folate_ug || 0);
      vitaminB12Ug += Number(micros.vitamin_b12_ug || 0);
      caffeineMg += Number(micros.caffeine_mg || 0);
      alcoholG += Number(micros.alcohol_g || 0);
    });

    // Use 1-decimal precision for trace nutrients (small values like iron, zinc, B vitamins)
    // to avoid Math.round() losing accuracy (e.g., 1.2mg iron → 1mg)
    const r1 = (v: number) => parseFloat((v / daysForAverage).toFixed(1));
    const r0 = (v: number) => Math.round(v / daysForAverage);

    setMicroAverages({
      sodium_mg: r0(sodiumMg),
      sugar_g: r0(sugarG),
      fiber_g: r0(fiberG),
      saturated_fat_g: r0(saturatedFatG),
      trans_fat_g: r1(transFatG),
      cholesterol_mg: r0(cholesterolMg),
      potassium_mg: r0(potassiumMg),
      calcium_mg: r0(calciumMg),
      iron_mg: r1(ironMg),
      magnesium_mg: r0(magnesiumMg),
      phosphorus_mg: r0(phosphorusMg),
      zinc_mg: r1(zincMg),
      copper_mg: r1(copperMg),
      manganese_mg: r1(manganeseMg),
      selenium_ug: r1(seleniumUg),
      vitamin_a_ug: r0(vitaminAUg),
      vitamin_c_mg: r0(vitaminCMg),
      vitamin_d_ug: r1(vitaminDUg),
      vitamin_e_mg: r1(vitaminEMg),
      vitamin_k_ug: r0(vitaminKUg),
      thiamin_b1_mg: r1(thiaminB1Mg),
      riboflavin_b2_mg: r1(riboflavinB2Mg),
      niacin_b3_mg: r1(niacinB3Mg),
      vitamin_b6_mg: r1(vitaminB6Mg),
      folate_ug: r0(folateUg),
      vitamin_b12_ug: r1(vitaminB12Ug),
      caffeine_mg: r0(caffeineMg),
      alcohol_g: r1(alcoholG),
    });
  }, [timeRange, user?.daily_calorie_target]);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      try {
        const bundle = await analyticsApi.getAnalyticsBundle(user.id, timeRange);
        const meals = (bundle?.history?.meals || []).map((m: any) => ({
          ...m,
          total_calories: m?.total_calories ?? m?.totalCalories ?? 0,
          total_protein: m?.total_protein ?? m?.totalProtein ?? 0,
          total_carbs: m?.total_carbs ?? m?.totalCarbs ?? 0,
          total_fat: m?.total_fat ?? m?.totalFat ?? 0,
          meal_type: m?.meal_type ?? m?.mealType,
          timestamp: m?.timestamp ?? m?.created_at ?? m?.createdAt,
        }));

        setPeriodMealCount(bundle?.history?.count ?? meals.length);

        processWeeklyData(meals);
        processMacroDistribution(meals);
        processMealTypeBreakdown(meals);
        processTopFoods(meals);
        calculateAverages(meals);

        // If analytics cache is stale, trigger a refresh in the background
        if ((bundle as any)?.stale && meals.length > 0) {
          console.log('[Analytics] Cache is stale, triggering background refresh...');
          analyticsApi.refreshAnalytics(user.id, timeRange).catch((err) => {
            console.warn('[Analytics] Background refresh failed:', err);
          });
        }

        const aiData = (bundle as any)?.daily_ai || (bundle as any)?.ai || {};
        const isInactive = !!(aiData as any)?.inactive || (bundle?.history?.count ?? 0) === 0;
        if (isInactive) {
          resetAiSections();
        } else {
          setAiAnalysis(aiData);
          if (aiData.bio_impact && typeof aiData.bio_impact === 'object') {
            const bio = aiData.bio_impact as ApiBioImpact;
            setBioImpact({
              energy: bio.energy ?? 0,
              recovery: bio.recovery ?? 0,
              focus: bio.focus ?? 0,
              stability: bio.stability ?? 0,
              antioxidants: bio.antioxidants ?? 0,
              digestion: bio.digestion ?? 0,
              organEffects: {
                heart: bio.organ_effects?.heart ?? 0,
                liver: bio.organ_effects?.liver ?? 0,
                kidney: bio.organ_effects?.kidney ?? 0,
                brain: bio.organ_effects?.brain ?? 0,
                skin: bio.organ_effects?.skin ?? 0,
              },
            });
          } else {
            resetAiSections();
          }
        }
      } catch (err) {
        console.warn('[Analytics] Bundle fetch failed, falling back to legacy flow:', err);
        // Fallback to the previous 2-request flow if bundle is not available
        let days = 7;
        if (timeRange === 'month') days = 30;

        const history = await mealApi.getHistory(user.id, days);
        const meals = (history?.meals || []).map((m: any) => ({
          ...m,
          total_calories: m?.total_calories ?? m?.totalCalories ?? 0,
          total_protein: m?.total_protein ?? m?.totalProtein ?? 0,
          total_carbs: m?.total_carbs ?? m?.totalCarbs ?? 0,
          total_fat: m?.total_fat ?? m?.totalFat ?? 0,
          meal_type: m?.meal_type ?? m?.mealType,
          timestamp: m?.timestamp ?? m?.created_at ?? m?.createdAt,
        }));

        setPeriodMealCount(history?.count ?? meals.length);

        processWeeklyData(meals);
        processMacroDistribution(meals);
        processMealTypeBreakdown(meals);
        processTopFoods(meals);
        calculateAverages(meals);

        const aiData = await analyticsApi.getAnalytics(user.id, timeRange);
        const isInactive = !!(aiData as any)?.inactive || meals.length === 0;
        if (isInactive) {
          resetAiSections();
        } else {
          setAiAnalysis(aiData);
          if (aiData.bio_impact && typeof aiData.bio_impact === 'object') {
            const bio = aiData.bio_impact as ApiBioImpact;
            setBioImpact({
              energy: bio.energy ?? 0,
              recovery: bio.recovery ?? 0,
              focus: bio.focus ?? 0,
              stability: bio.stability ?? 0,
              antioxidants: bio.antioxidants ?? 0,
              digestion: bio.digestion ?? 0,
              organEffects: {
                heart: bio.organ_effects?.heart ?? 0,
                liver: bio.organ_effects?.liver ?? 0,
                kidney: bio.organ_effects?.kidney ?? 0,
                brain: bio.organ_effects?.brain ?? 0,
                skin: bio.organ_effects?.skin ?? 0,
              },
            });
          } else {
            resetAiSections();
          }
        }
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [user, timeRange, processWeeklyData, processMacroDistribution, processMealTypeBreakdown, calculateAverages, processTopFoods, resetAiSections]);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange, fetchAnalytics]);

  const hasAnyMacros = macroDistribution.some(item => item.value > 1);
  const isInactivePeriod = periodMealCount === 0;

  return (
    <View style={styles.container}>
      <PageHeader
        title="Analytics"
        subtitle="Your nutrition insights"
        rightComponent={
          <TouchableOpacity
            style={styles.profileIconButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push('/(tabs)/profile');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={20} color={theme.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchAnalytics}
            tintColor={theme.primary}
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
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
          <InsightHeader
            title="Daily Averages"
            insight={aiAnalysis?.insights?.macro_balance}
          />
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="flame" size={28} color={theme.primary} />
              <Text style={styles.statValue}>{(+(averages.calories || 0)).toFixed(1)}</Text>
              <Text style={styles.statLabel}>kcal/day</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="fitness" size={28} color={Colors.protein} />
              <Text style={styles.statValue}>{(+(averages.protein || 0)).toFixed(1)}g</Text>
              <Text style={styles.statLabel}>Protein</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="leaf" size={28} color={Colors.carbs} />
              <Text style={styles.statValue}>{(+(averages.carbs || 0)).toFixed(1)}g</Text>
              <Text style={styles.statLabel}>Carbs</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="water" size={28} color={Colors.fat} />
              <Text style={styles.statValue}>{(+(averages.fat || 0)).toFixed(1)}g</Text>
              <Text style={styles.statLabel}>Fat</Text>
            </View>
          </View>
        </AnimatedCard>

        <HydrationTracker userId={user?.id} delay={125} readOnly={true} />

        <AnimatedCard delay={150} type="slide" style={styles.section}>
          <InsightHeader
            title="Micronutrients (Daily Avg)"
            insight={aiAnalysis?.insights?.micronutrient_status}
          />

          <Text style={styles.subSectionTitle}>Key Minerals & Fiber</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="water-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.sodium_mg || 0}</Text>
              <Text style={styles.statLabel}>Sodium (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="leaf-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.fiber_g || 0}</Text>
              <Text style={styles.statLabel}>Fiber (g)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="battery-charging-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.potassium_mg || 0}</Text>
              <Text style={styles.statLabel}>Potassium (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="nutrition-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.calcium_mg || 0}</Text>
              <Text style={styles.statLabel}>Calcium (mg)</Text>
            </View>
          </View>

          <View style={[styles.statsGrid, { marginTop: 12 }]}>
            <View style={styles.statCard}>
              <Ionicons name="pulse-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.iron_mg || 0}</Text>
              <Text style={styles.statLabel}>Iron (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flash-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.magnesium_mg || 0}</Text>
              <Text style={styles.statLabel}>Magnesium (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cog-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{(microAverages.zinc_mg || 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Zinc (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="construct-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.phosphorus_mg || 0}</Text>
              <Text style={styles.statLabel}>Phosphorus (mg)</Text>
            </View>
          </View>

          <Text style={[styles.subSectionTitle, { marginTop: 20 }]}>Vitamins</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="sunny-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.vitamin_c_mg || 0}</Text>
              <Text style={styles.statLabel}>Vit C (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="eye-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.vitamin_a_ug || 0}</Text>
              <Text style={styles.statLabel}>Vit A (µg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="rainy-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{(microAverages.vitamin_d_ug || 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Vit D (µg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="shield-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{(microAverages.vitamin_e_mg || 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Vit E (mg)</Text>
            </View>
          </View>

          <View style={[styles.statsGrid, { marginTop: 12 }]}>
            <View style={styles.statCard}>
              <Ionicons name="leaf-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.vitamin_k_ug || 0}</Text>
              <Text style={styles.statLabel}>Vit K (µg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="medical-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{(microAverages.vitamin_b12_ug || 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>B12 (µg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="ellipse-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.folate_ug || 0}</Text>
              <Text style={styles.statLabel}>Folate (µg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flask-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{(microAverages.vitamin_b6_mg || 0).toFixed(1)}</Text>
              <Text style={styles.statLabel}>B6 (mg)</Text>
            </View>
          </View>

          <Text style={[styles.subSectionTitle, { marginTop: 20 }]}>Fats & Others</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="cafe-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.sugar_g || 0}</Text>
              <Text style={styles.statLabel}>Sugar (g)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="flame-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.saturated_fat_g || 0}</Text>
              <Text style={styles.statLabel}>Sat Fat (g)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="contrast-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.cholesterol_mg || 0}</Text>
              <Text style={styles.statLabel}>Chol (mg)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="remove-circle-outline" size={24} color={theme.text} />
              <Text style={styles.statValue}>{microAverages.trans_fat_g || 0}</Text>
              <Text style={styles.statLabel}>Trans (g)</Text>
            </View>
          </View>
        </AnimatedCard>

        {weeklyData.length > 0 && (
          <AnimatedCard delay={200} type="slide" style={styles.section}>
            <SectionTitle title="Calorie Trend" />
            <AppCard style={styles.chartCard} padding={0}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 20 }}
              >
                <View style={[styles.chartWrapper, { padding: 20 }]}>
                  <StandardBarChart
                    data={weeklyData}
                    width={timeRange === 'week' ? CARD_WIDTH - 40 : (timeRange === 'month' ? CARD_WIDTH - 40 : CARD_WIDTH * 2)}
                    height={200}
                    barWidth={timeRange === 'week' ? 20 : (timeRange === 'month' ? 40 : 28)}
                    spacing={timeRange === 'week' ? 15 : (timeRange === 'month' ? 30 : 22)}
                    labelWidth={timeRange === 'week' ? 56 : (timeRange === 'month' ? 70 : 50)}
                    showValuesAsTopLabel
                    maxValueFallback={3000}
                  />
                </View>
              </ScrollView>
            </AppCard>
          </AnimatedCard>
        )}

        <AnimatedCard delay={300} type="slide" style={styles.section}>
          <SectionTitle title="Macro Distribution" />
          <AppCard style={styles.standardCard} padding={0}>
            <View style={[styles.macroContent, { padding: 20 }]}>
              <View style={styles.pieChartContainer}>
                <View style={styles.pieChartWrapper}>
                  <StandardDonutChart
                    data={hasAnyMacros ? macroDistribution : [{ value: 1, color: theme.border }]}
                    radius={90}
                    innerRadius={60}
                    showText
                    centerLabelComponent={() => (
                      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="nutrition" size={20} color={theme.white} />
                        <Text style={{ marginTop: 4, color: theme.primary, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>
                          Macros
                        </Text>
                      </View>
                    )}
                  />
                </View>
              </View>

              <View style={styles.macroLegend}>
                {macroDistribution.map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <View style={styles.legendInfo}>
                      <Text style={styles.legendLabel}>{item.label}</Text>
                      <Text style={styles.legendValue}>{Math.round(item.value)}g</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </AppCard>
        </AnimatedCard>

        <AnimatedCard delay={350} type="slide" style={styles.section}>
          <InsightHeader
            title="Meal Type Breakdown"
            insight={aiAnalysis?.insights?.timing}
          />
          <View style={styles.mealTypeCard}>
            {Object.entries(mealTypeBreakdown).map(([type, data]: [string, any]) => (
              <View key={type} style={styles.mealTypeRow}>
                <View style={styles.mealTypeInfo}>
                  <View style={[styles.mealTypeIconContainer, {
                    backgroundColor:
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
          <InsightHeader
            title="Top Foods"
            insight={aiAnalysis?.insights?.variety}
          />
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
              <EmptyState
                style={styles.emptyFoods}
                icon="fast-food-outline"
                title="No food data yet"
                titleStyle={styles.emptyFoodsText}
              />
            )}
          </View>
        </AnimatedCard>

        {ingredientInsights.length > 0 && (
          <AnimatedCard delay={475} type="slide" style={styles.section}>
            <SectionTitle title="Frequent Ingredients" />
            <View style={styles.ingredientsCard}>
              <View style={styles.ingredientsGrid}>
                {ingredientInsights.map((ing, index) => (
                  <View key={index} style={styles.ingredientBadge}>
                    <Ionicons name="leaf-outline" size={14} color={theme.primary} />
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
          <SectionTitle title="Health Insights" />
          {isInactivePeriod ? (
            <EmptyState
              icon="analytics-outline"
              title="No meals logged"
              titleStyle={styles.emptyFoodsText}
            />
          ) : (
            <View style={styles.healthInsightsCard}>
              <View style={styles.organGrid}>
                {[
                  { label: 'Heart', key: 'heart', score: bioImpact.organEffects.heart, icon: 'heart', color: Colors.error },
                  { label: 'Liver', key: 'liver', score: bioImpact.organEffects.liver, icon: 'shield-checkmark', color: Colors.success },
                  { label: 'Kidney', key: 'kidney', score: bioImpact.organEffects.kidney, icon: 'water', color: Colors.info },
                  { label: 'Brain', key: 'brain', score: bioImpact.organEffects.brain, icon: 'flash', color: Colors.warning },
                  { label: 'Skin', key: 'skin', score: bioImpact.organEffects.skin, icon: 'sparkles', color: theme.primary },
                ].map((organ, index) => (
                  <View key={index} style={styles.organItem}>
                    <View style={[styles.organIconContainer, { backgroundColor: organ.color + '15' }]}>
                      <Ionicons name={organ.icon as any} size={20} color={organ.color} />
                    </View>
                    <View style={styles.organInfo}>
                      <View style={styles.organHeader}>
                        <Text style={styles.organLabel}>{organ.label}</Text>
                        <Text style={[styles.organScore, { color: organ.score < 50 ? Colors.error : (organ.score < 80 ? Colors.warning : Colors.success) }]}>
                          {organ.score}%
                        </Text>
                      </View>
                      <View style={styles.organProgressBg}>
                        <View
                          style={[
                            styles.organProgressFill,
                            {
                              width: `${organ.score}%`,
                              backgroundColor: organ.score < 50 ? Colors.error : (organ.score < 80 ? Colors.warning : Colors.success)
                            }
                          ]}
                        />
                      </View>
                      {aiAnalysis?.health_insights?.[organ.key] && (
                        <Text style={styles.organInsightText} numberOfLines={2} ellipsizeMode="tail">
                          {aiAnalysis.health_insights[organ.key]}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </AnimatedCard>

        <AnimatedCard delay={550} type="slide" style={styles.section}>
          <SectionTitle title="Biological Impact" />
          {isInactivePeriod ? (
            <EmptyState
              icon="analytics-outline"
              title="No meals logged"
              titleStyle={styles.emptyFoodsText}
            />
          ) : (
            <View style={styles.healthInsightsCard}>
              <View style={styles.organGrid}>
                {[
                  { label: 'Energy Levels', value: bioImpact.energy, icon: 'flash', color: Colors.warning },
                  { label: 'Muscle Recovery', value: bioImpact.recovery, icon: 'barbell', color: Colors.error },
                  { label: 'Mental Focus', value: bioImpact.focus, icon: 'eye', color: Colors.info },
                  { label: 'Sugar Stability', value: bioImpact.stability, icon: 'pulse', color: Colors.success },
                  { label: 'Antioxidant Load', value: bioImpact.antioxidants, icon: 'leaf', color: theme.primary },
                  { label: 'Digestive Ease', value: bioImpact.digestion, icon: 'water', color: Colors.info },
                ].map((item, index) => (
                  <View key={index} style={styles.organItem}>
                    <View style={[styles.organIconContainer, { backgroundColor: item.color + '15' }]}>
                      <Ionicons name={item.icon as any} size={20} color={item.color} />
                    </View>
                    <View style={styles.organInfo}>
                      <View style={styles.organHeader}>
                        <Text style={styles.organLabel}>{item.label}</Text>
                        <Text style={[styles.organScore, { color: item.color }]}>
                          {item.value}%
                        </Text>
                      </View>
                      <View style={styles.organProgressBg}>
                        <View
                          style={[
                            styles.organProgressFill,
                            {
                              width: `${item.value}%`,
                              backgroundColor: item.color
                            }
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </AnimatedCard>

        {(() => {
          const highlights: any[] = [
            ...(aiAnalysis?.bio_alerts || []).map((a: any) => ({ ...a, type: 'alert' })),
            ...(aiAnalysis?.red_flags || []).map((f: any) => ({ ...f, type: 'flag' })),
          ];

          if (isInactivePeriod || highlights.length === 0) return null;

          const getSeverityValue = (item: any) => {
            const status = item.type === 'alert' ? item.status : item.severity;
            if (status === 'critical') return 2;
            if (status === 'warning') return 1;
            return 0; // success / normal
          };

          const sortedHighlights = highlights.sort((a, b) => getSeverityValue(a) - getSeverityValue(b));

          return (
            <AnimatedCard delay={600} type="slide" style={styles.section}>
              <SectionTitle title="Highlights" />
              <View style={styles.redFlagsCard}>
                {sortedHighlights.map((item: any, index: number) => (
                  item.type === 'alert' ?
                    <CollapsibleBioAlert key={`alert-${index}`} alert={item} /> :
                    <CollapsibleRedFlag key={`flag-${index}`} flag={item} />
                ))}
              </View>
            </AnimatedCard>
          );
        })()}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: theme.primary,
  },
  timeRangeText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  timeRangeTextActive: {
    color: theme.white,
  },
  section: {
    marginBottom: 20,
  },
  toolCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  toolIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: Colors.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.warning + '35',
    borderBottomWidth: 4,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  toolSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 18,
  },
  standardCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    borderBottomColor: theme.border,
  },
  sectionTitle: {
    fontSize: 18, // H2
    fontWeight: '900',
    color: theme.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
    opacity: 0.9,
  },
  insightText: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 16,
    height: 110, // Fixed height for consistent grid alignment
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
    marginVertical: 4,
  },
  statLabel: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    textAlign: 'center',
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
    color: theme.text,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.textSecondary,
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
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
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
    fontSize: 15, // H3
    fontWeight: '900',
    color: theme.textSecondary,
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
    color: theme.text,
  },
  organScoreCompact: {
    fontSize: 12,
    fontWeight: '900',
  },
  chartCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    overflow: 'hidden',
  },
  chartWrapper: {
    paddingLeft: 0,
    paddingRight: 0,
    overflow: 'visible',
  },
  hollowBar: {
    flex: 1,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    borderBottomColor: theme.border,
    borderRadius: 8,
    marginHorizontal: 1,
  },
  macroContent: {
    // No extra padding
  },
  pieChartContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pieChartWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 140,
    height: 140,
  },
  macroLegend: {
    gap: 14,
  },
  legendItem: {
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
  legendInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.text,
  },
  legendValue: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '800',
  },
  mealTypeCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 12,
  },
  mealTypeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  mealTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealTypeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealTypeName: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealTypeStats: {
    alignItems: 'flex-end',
  },
  mealTypeCount: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
  },
  mealTypeCalories: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '800',
  },
  topFoodsCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 10,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
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
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodRankText: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.white,
  },
  foodName: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
    flex: 1,
  },
  foodStats: {
    alignItems: 'flex-end',
  },
  foodCount: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.primary,
  },
  foodCalories: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '800',
  },
  ingredientsCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  ingredientsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ingredientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
  ingredientBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.text,
    textTransform: 'uppercase',
  },
  ingCountBadge: {
    backgroundColor: theme.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ingCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.white,
  },
  emptyFoods: {
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  emptyFoodsText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textLight,
  },
  healthInsightsCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  organGrid: {
    gap: 12,
  },
  organItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  organIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderWidth: 1,
    borderColor: theme.border,
  },
  organInfo: {
    flex: 1,
  },
  organHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  organLabel: {
    fontSize: 14, // Standardized
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  organScore: {
    fontSize: 14, // Standardized
    fontWeight: '900',
  },
  organProgressBg: {
    height: 6,
    backgroundColor: theme.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  organProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  organInsightText: {
    fontSize: 12, // Standardized caption
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 16,
  },
  bioImpactCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  bioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bioItem: {
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  bioIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderWidth: 1,
    borderColor: theme.border,
  },
  bioInfo: {
    width: '100%',
  },
  bioLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  bioLabel: {
    fontSize: 11, // Standardized caption
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bioValueText: {
    fontSize: 14, // Standardized
    fontWeight: '900',
    color: theme.text,
  },
  bioProgressBg: {
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  bioProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  redFlagsCard: {
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 16,
  },
  alertCard: {
    backgroundColor: '#F8F9FA',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  alertIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertBody: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
  },
  bioAlertMetric: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bioAlertMessage: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '700',
    lineHeight: 18,
  },
  redFlagItem: {
    // Deprecated in favor of alertCard, kept for safety if needed
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF3B3020',
  },
  redFlagCritical: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FF3B3030',
  },
  redFlagWarning: {
    backgroundColor: '#FFF9F0',
    borderColor: '#FF950030',
  },
  redFlagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  redFlagTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FF3B30',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  redFlagDescription: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
    marginBottom: 14,
    fontWeight: '700',
  },
  redFlagCulprits: {
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  redFlagCulpritsLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.8,
  },
  redFlagCulpritsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  redFlagCulpritBadge: {
    backgroundColor: theme.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  redFlagCulpritText: {
    fontSize: 13,
    fontWeight: '800',
  },
  redFlagFrequency: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '900',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bioCorrectiveInsights: {
    marginTop: 24,
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderBottomWidth: 8,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
    gap: 16,
  },
  correctiveTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  correctiveItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: theme.white,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  correctiveText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 18,
  },
  correctiveSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
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
    backgroundColor: theme.white,
    borderRadius: 32,
    padding: 24,
    width: '100%',
    borderWidth: 2,
    borderColor: theme.border,
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
    color: theme.text,
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
    borderColor: theme.border,
  },
  modalStatLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  modalScoreCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  modalScoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.white,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
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
    color: theme.text,
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
    borderColor: theme.border,
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
    color: theme.text,
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
    color: theme.text,
    marginBottom: 4,
  },
  labelDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 16,
  },
  solutionText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 22,
  },
  modalCloseBtn: {
    backgroundColor: theme.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  modalCloseBtnText: {
    color: theme.white,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  profileIconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  });
}
