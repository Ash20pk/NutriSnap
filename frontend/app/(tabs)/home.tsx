import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [stats, setStats] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchWeeklyData();
    }
  }, [user]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(bounceAnim, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await mealApi.getStats(user.id);
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    if (!user) return;
    try {
      const history = await mealApi.getHistory(user.id, 7);
      const dayTotals: any = {};
      history.meals.forEach((meal: any) => {
        const day = format(new Date(meal.timestamp), 'EEE');
        if (!dayTotals[day]) {
          dayTotals[day] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        }
        dayTotals[day].calories += meal.total_calories;
        dayTotals[day].protein += meal.total_protein;
        dayTotals[day].carbs += meal.total_carbs;
        dayTotals[day].fat += meal.total_fat;
      });

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const chartData = days.map(day => ({
        label: day,
        value: dayTotals[day]?.calories || 0,
        frontColor: Colors.primary,
      }));
      setWeeklyData(chartData);
    } catch (error) {
      console.error('Error fetching weekly data:', error);
    }
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const caloriesProgress = calculateProgress(
    stats?.total_calories || 0,
    stats?.targets?.calories || 2000
  );

  const hasMetGoal = caloriesProgress >= 80 && caloriesProgress <= 120;

  const macroData = [
    {
      value: stats?.total_protein || 0,
      color: Colors.protein,
      text: `${Math.round(stats?.total_protein || 0)}g`,
    },
    {
      value: stats?.total_carbs || 0,
      color: Colors.carbs,
      text: `${Math.round(stats?.total_carbs || 0)}g`,
    },
    {
      value: stats?.total_fat || 0,
      color: Colors.fat,
      text: `${Math.round(stats?.total_fat || 0)}g`,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Background Vector Elements */}
      <View style={styles.backgroundVectors}>
        <View style={[styles.circle, styles.circle1]} />
        <View style={[styles.circle, styles.circle2]} />
        <View style={[styles.circle, styles.circle3]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={loading} 
            onRefresh={() => {
              fetchStats();
              fetchWeeklyData();
            }} 
            tintColor={Colors.primary} 
            colors={[Colors.primary]}
          />
        }
      >
        {/* Animated Header */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          <View>
            <Text style={styles.greeting}>Hello, {user?.name}! 👋</Text>
            <Text style={styles.subtitle}>
              {hasMetGoal 
                ? "You've hit your calorie goal! 🎯" 
                : `${Math.round((stats?.targets?.calories || 2000) - (stats?.total_calories || 0))} kcal remaining today`}
            </Text>
          </View>
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={20} color={Colors.accent} />
            <Text style={styles.streakText}>5</Text>
          </View>
        </Animated.View>

        {/* Weekly Wrap-Up Button */}
        <Animated.View style={[{ opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.wrapUpButton}
            onPress={() => router.push('/weekly-wrap')}
            activeOpacity={0.8}
          >
            <View style={styles.wrapUpContent}>
              <View style={styles.wrapUpIcon}>
                <Ionicons name="stats-chart" size={24} color={Colors.primary} />
              </View>
              <View style={styles.wrapUpText}>
                <Text style={styles.wrapUpTitle}>Weekly Snapshot 📸</Text>
                <Text style={styles.wrapUpSubtitle}>View your nutrition wrapped</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Character Illustration Section */}
        <Animated.View 
          style={[
            styles.characterSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: bounceAnim }],
            }
          ]}
        >
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={20} tint="light" style={styles.blurContainer}>
                <View style={styles.characterContainer}>
                  <Text style={styles.characterEmoji}>🥗</Text>
                  <View style={styles.speechBubble}>
                    <Text style={styles.speechText}>
                      {caloriesProgress < 30 ? "Let's fuel up! 💪" :
                       caloriesProgress < 70 ? "Great progress! 🎯" :
                       caloriesProgress < 100 ? "Almost there! 🚀" :
                       "Goal crushed! 🎉"}
                    </Text>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={[styles.blurContainer, styles.androidGlass]}>
                <View style={styles.characterContainer}>
                  <Text style={styles.characterEmoji}>🥗</Text>
                  <View style={styles.speechBubble}>
                    <Text style={styles.speechText}>
                      {caloriesProgress < 30 ? "Let's fuel up! 💪" :
                       caloriesProgress < 70 ? "Great progress! 🎯" :
                       caloriesProgress < 100 ? "Almost there! 🚀" :
                       "Goal crushed! 🎉"}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Today's Calories - Glass Card */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Today's Calories</Text>
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={20} tint="light" style={styles.blurContainer}>
                <View style={styles.caloriesContent}>
                  <View style={styles.caloriesHeader}>
                    <View>
                      <Text style={styles.caloriesValue}>
                        {Math.round(stats?.total_calories || 0)}
                      </Text>
                      <Text style={styles.caloriesTarget}>
                        of {Math.round(stats?.targets?.calories || 2000)} kcal
                      </Text>
                    </View>
                    <View style={styles.caloriesCircle}>
                      <Text style={styles.percentageText}>
                        {Math.round(caloriesProgress)}%
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.progressBarContainer}>
                    <View 
                      style={[
                        styles.progressBar,
                        { width: `${caloriesProgress}%` }
                      ]} 
                    />
                  </View>

                  <View style={styles.caloriesFooter}>
                    <View style={styles.caloriesStat}>
                      <Ionicons name="flame-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.caloriesStatText}>
                        {Math.round((stats?.targets?.calories || 2000) - (stats?.total_calories || 0))} left
                      </Text>
                    </View>
                    <View style={styles.caloriesStat}>
                      <Ionicons name="restaurant-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.caloriesStatText}>
                        {stats?.meals_logged || 0} meals
                      </Text>
                    </View>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={[styles.blurContainer, styles.androidGlass]}>
                <View style={styles.caloriesContent}>
                  <View style={styles.caloriesHeader}>
                    <View>
                      <Text style={styles.caloriesValue}>
                        {Math.round(stats?.total_calories || 0)}
                      </Text>
                      <Text style={styles.caloriesTarget}>
                        of {Math.round(stats?.targets?.calories || 2000)} kcal
                      </Text>
                    </View>
                    <View style={styles.caloriesCircle}>
                      <Text style={styles.percentageText}>
                        {Math.round(caloriesProgress)}%
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.progressBarContainer}>
                    <View 
                      style={[
                        styles.progressBar,
                        { width: `${caloriesProgress}%` }
                      ]} 
                    />
                  </View>

                  <View style={styles.caloriesFooter}>
                    <View style={styles.caloriesStat}>
                      <Ionicons name="flame-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.caloriesStatText}>
                        {Math.round((stats?.targets?.calories || 2000) - (stats?.total_calories || 0))} left
                      </Text>
                    </View>
                    <View style={styles.caloriesStat}>
                      <Ionicons name="restaurant-outline" size={18} color={Colors.textSecondary} />
                      <Text style={styles.caloriesStatText}>
                        {stats?.meals_logged || 0} meals
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Macro Breakdown - Glass Card */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Macro Breakdown</Text>
          <View style={styles.glassCard}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={20} tint="light" style={styles.blurContainer}>
                <View style={styles.macroContent}>
                  <View style={styles.pieChartContainer}>
                    <PieChart
                      data={macroData}
                      donut
                      radius={70}
                      innerRadius={50}
                      centerLabelComponent={() => (
                        <Text style={styles.pieChartCenter}>Macros</Text>
                      )}
                    />
                  </View>
                  
                  <View style={styles.macroLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.protein }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Protein</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_protein || 0)}g / {Math.round(stats?.targets?.protein || 150)}g
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.carbs }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Carbs</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_carbs || 0)}g / {Math.round(stats?.targets?.carbs || 200)}g
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.fat }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Fat</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_fat || 0)}g / {Math.round(stats?.targets?.fat || 65)}g
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </BlurView>
            ) : (
              <View style={[styles.blurContainer, styles.androidGlass]}>
                <View style={styles.macroContent}>
                  <View style={styles.pieChartContainer}>
                    <PieChart
                      data={macroData}
                      donut
                      radius={70}
                      innerRadius={50}
                      centerLabelComponent={() => (
                        <Text style={styles.pieChartCenter}>Macros</Text>
                      )}
                    />
                  </View>
                  
                  <View style={styles.macroLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.protein }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Protein</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_protein || 0)}g / {Math.round(stats?.targets?.protein || 150)}g
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.carbs }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Carbs</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_carbs || 0)}g / {Math.round(stats?.targets?.carbs || 200)}g
                        </Text>
                      </View>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: Colors.fat }]} />
                      <View style={styles.legendInfo}>
                        <Text style={styles.legendLabel}>Fat</Text>
                        <Text style={styles.legendValue}>
                          {Math.round(stats?.total_fat || 0)}g / {Math.round(stats?.targets?.fat || 65)}g
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Weekly Trend Chart - Glass Card */}
        {weeklyData.length > 0 && (
          <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
            <Text style={styles.sectionTitle}>This Week's Trend</Text>
            <View style={styles.glassCard}>
              {Platform.OS === 'ios' ? (
                <BlurView intensity={20} tint="light" style={styles.blurContainer}>
                  <View style={styles.chartContent}>
                    <BarChart
                      data={weeklyData}
                      width={CARD_WIDTH - 80}
                      height={180}
                      barWidth={28}
                      spacing={18}
                      roundedTop
                      roundedBottom
                      hideRules
                      xAxisThickness={0}
                      yAxisThickness={0}
                      yAxisTextStyle={{ color: Colors.textLight, fontSize: 10 }}
                      noOfSections={4}
                      maxValue={Math.max(...weeklyData.map(d => d.value), 2000)}
                    />
                  </View>
                </BlurView>
              ) : (
                <View style={[styles.blurContainer, styles.androidGlass]}>
                  <View style={styles.chartContent}>
                    <BarChart
                      data={weeklyData}
                      width={CARD_WIDTH - 80}
                      height={180}
                      barWidth={28}
                      spacing={18}
                      roundedTop
                      roundedBottom
                      hideRules
                      xAxisThickness={0}
                      yAxisThickness={0}
                      yAxisTextStyle={{ color: Colors.textLight, fontSize: 10 }}
                      noOfSections={4}
                      maxValue={Math.max(...weeklyData.map(d => d.value), 2000)}
                    />
                  </View>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Quick Stats Grid */}
        <Animated.View style={[styles.section, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#FFF5E6' }]}>
              <Ionicons name="trophy" size={28} color={Colors.accent} />
              <Text style={styles.statValue}>{user?.goal?.replace('_', ' ')}</Text>
              <Text style={styles.statLabel}>Goal</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="flash" size={28} color={Colors.primary} />
              <Text style={styles.statValue}>{user?.activity_level}</Text>
              <Text style={styles.statLabel}>Activity</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="scale" size={28} color={Colors.secondary} />
              <Text style={styles.statValue}>{user?.weight} kg</Text>
              <Text style={styles.statLabel}>Weight</Text>
            </View>
          </View>
        </Animated.View>

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
  backgroundVectors: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    borderRadius: 1000,
    opacity: 0.05,
  },
  circle1: {
    width: 300,
    height: 300,
    backgroundColor: Colors.primary,
    top: -100,
    right: -100,
  },
  circle2: {
    width: 200,
    height: 200,
    backgroundColor: Colors.accent,
    bottom: 100,
    left: -50,
  },
  circle3: {
    width: 150,
    height: 150,
    backgroundColor: Colors.secondary,
    top: 300,
    left: -30,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  streakText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  wrapUpButton: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  wrapUpContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  wrapUpIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wrapUpText: {
    flex: 1,
  },
  wrapUpTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 2,
  },
  wrapUpSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  characterSection: {
    marginBottom: 24,
  },
  glassCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  blurContainer: {
    padding: 20,
  },
  androidGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  characterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  characterEmoji: {
    fontSize: 60,
  },
  speechBubble: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 12,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  speechText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
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
  caloriesContent: {
    // No extra padding needed
  },
  caloriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  caloriesValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  caloriesTarget: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  caloriesCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  percentageText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },
  caloriesFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  caloriesStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caloriesStatText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  macroContent: {
    // No extra padding
  },
  pieChartContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  pieChartCenter: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  macroLegend: {
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  legendInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  legendValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  chartContent: {
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});