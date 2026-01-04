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
  Modal,
  Easing,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '../../components/PageHeader';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [stats, setStats] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [hasShownGoalToday, setHasShownGoalToday] = useState(false);
  const sparkleAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const shineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shineAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      })
    ).start();
  }, [shineAnim]);

  const fetchStats = React.useCallback(async () => {
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
  }, [user]);

  const fetchWeeklyData = React.useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchWeeklyData();
    }
  }, [user, fetchStats, fetchWeeklyData]);

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
  }, [bounceAnim, fadeAnim, slideAnim]);

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const caloriesProgress = calculateProgress(
    stats?.total_calories || 0,
    stats?.targets?.calories || 2000
  );

  const hasMetGoal = caloriesProgress >= 80 && caloriesProgress <= 120;

  useEffect(() => {
    if (hasMetGoal && !hasShownGoalToday && !loading && stats) {
      setShowGoalModal(true);
      setHasShownGoalToday(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      
      const animations = sparkleAnims.map((anim, i) => 
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 150),
            Animated.timing(anim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ])
        )
      );
      Animated.parallel(animations).start();
    }
  }, [hasMetGoal, hasShownGoalToday, loading, stats, sparkleAnims]);

  const renderSparkle = (anim: Animated.Value, index: number) => {
    const positions = [
      { top: -20, left: -20 },
      { top: -30, right: -10 },
      { bottom: 40, left: -30 },
      { bottom: -10, right: -20 },
      { top: 60, right: -40 },
      { top: 20, left: -40 },
    ];
    
    return (
      <Animated.View
        key={index}
        style={[
          styles.sparkle,
          positions[index],
          {
            opacity: anim,
            transform: [
              { scale: anim },
              { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }
            ]
          }
        ]}
      >
        <Ionicons name="sparkles" size={24} color={Colors.warning} />
      </Animated.View>
    );
  };

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
      <PageHeader 
        title={`Hello, ${user?.name}`} 
        subtitle={hasMetGoal 
          ? "You've hit your calorie goal! 🎯" 
          : `${Math.round((stats?.targets?.calories || 2000) - (stats?.total_calories || 0))} kcal remaining today`}
        rightComponent={
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.profileIconButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/(tabs)/profile');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={20} color={Colors.text} />
            </TouchableOpacity>

            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={20} color={Colors.accent} />
              <Text style={styles.streakText}>5</Text>
            </View>
          </View>
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
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
        {/* Weekly Snapshot Banner */}
        <AnimatedCard delay={100} type="pop" style={styles.bannerContainer}>
          <TouchableOpacity 
            style={styles.bannerCard}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push('/weekly-wrap');
            }}
            activeOpacity={0.9}
          >
            <LinearGradient 
              colors={[Colors.primary, Colors.accent]} 
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill} 
            />
            
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [
                    {
                      translateX: shineAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-width, width * 1.5],
                      }),
                    },
                    { rotate: '25deg' },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.0)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.0)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: 150, height: '200%', top: -50 }}
              />
            </Animated.View>

            <View style={[styles.bannerCircle, { top: -30, right: -20, width: 120, height: 120 }]} />
            <View style={[styles.bannerCircle, { bottom: -40, left: 40, width: 150, height: 150 }]} />
            <View style={styles.bannerIconFloating}>
              <Ionicons name="stats-chart" size={120} color={Colors.white} />
            </View>

            <View style={styles.bannerBadge}>
              <Text style={styles.bannerBadgeText}>NEW UPDATE</Text>
            </View>
            
            <View style={styles.bannerContent}>
              <View style={styles.bannerTextContainer}>
                <Text style={styles.bannerTitle}>Weekly Report is Ready!</Text>
                <Text style={styles.bannerSubtitle}>
                  You&apos;ve completed another week of healthy eating. See your progress!
                </Text>
                <View style={styles.bannerCTA}>
                  <Text style={styles.bannerCTAText}>SHOW ME</Text>
                </View>
              </View>
              <View style={styles.bannerImageContainer}>
                <Ionicons name="trophy" size={60} color={Colors.warning} />
              </View>
            </View>
          </TouchableOpacity>
        </AnimatedCard>

        {/* Motivational Message */}
        <AnimatedCard delay={200} type="slide" style={styles.motivationSection}>
          <View style={styles.motivationCard}>
            <View style={styles.motivationContent}>
              <View style={styles.motivationEmojiContainer}>
                <Text style={styles.motivationEmoji}>
                  {caloriesProgress < 30 ? "🥗" :
                   caloriesProgress < 70 ? "🎯" :
                   caloriesProgress < 100 ? "🚀" :
                   "🎉"}
                </Text>
              </View>
              <View style={styles.motivationMessage}>
                <Text style={styles.motivationTitle}>
                  {caloriesProgress < 30 ? "Let's fuel up!" :
                   caloriesProgress < 70 ? "Great progress!" :
                   caloriesProgress < 100 ? "Almost there!" :
                   "Goal crushed!"}
                </Text>
                <Text style={styles.motivationSubtitle}>
                  {caloriesProgress < 30 ? "Start your day with a nutritious meal" :
                   caloriesProgress < 70 ? "You're on track with your calories" :
                   caloriesProgress < 100 ? "Just a little more to reach your goal" :
                   "You've hit your daily target! Amazing!"}
                </Text>
              </View>
            </View>
            <View style={styles.progressIndicator}>
              <View style={[styles.progressBar, { width: `${Math.min(caloriesProgress, 100)}%` } ]} />
            </View>
          </View>
        </AnimatedCard>

        {/* Today's Calories - Glass Card */}
        <AnimatedCard delay={300} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Today&apos;s Calories</Text>
          <View style={styles.standardCard}>
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
                    styles.caloriesProgressBar,
                    { width: `${Math.min(caloriesProgress, 100)}%` },
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
        </AnimatedCard>

        {/* Macro Breakdown - Glass Card */}
        <AnimatedCard delay={400} type="slide" style={styles.section}>
          <Text style={styles.sectionTitle}>Macro Breakdown</Text>
          <View style={styles.standardCard}>
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
        </AnimatedCard>

        {/* Weekly Trend Chart - Glass Card */}
        {weeklyData.length > 0 && (
          <AnimatedCard delay={500} type="slide" style={styles.section}>
            <Text style={styles.sectionTitle}>This Week&apos;s Trend</Text>
            <View style={styles.standardCard}>
              <View style={styles.chartContent}>
                <BarChart
                  data={weeklyData}
                  width={width - 88}
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
          </AnimatedCard>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Goal Crushed Modal */}
      <Modal
        visible={showGoalModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <AnimatedCard type="pop" style={styles.goalModalContent}>
            <View style={styles.goalEmojiWrap}>
              <Text style={styles.goalEmoji}>🎯</Text>
              {sparkleAnims.map((anim, i) => renderSparkle(anim, i))}
            </View>
            
            <View style={styles.goalModalHeader}>
              <Text style={styles.goalModalTitle}>Daily Goal</Text>
              <Text style={[styles.goalModalTitle, { color: Colors.primary }]}>Crushed!</Text>
            </View>

            <Text style={styles.goalModalText}>
              You&apos;ve hit your calorie target for today. Consistency is key to success!
            </Text>
            
            <View style={styles.goalStatsRow}>
              <View style={styles.goalStatItem}>
                <Text style={styles.goalStatValue}>{Math.round(stats?.total_calories || 0)}</Text>
                <Text style={styles.goalStatLabel}>KCAL</Text>
              </View>
              <View style={styles.goalStatDivider} />
              <View style={styles.goalStatItem}>
                <Text style={styles.goalStatValue}>{stats?.meals_logged || 0}</Text>
                <Text style={styles.goalStatLabel}>MEALS</Text>
              </View>
            </View>

            <View style={styles.goalXpWrap}>
              <View style={styles.xpIconContainer}>
                <Ionicons name="flash" size={20} color={Colors.white} />
              </View>
              <Text style={styles.goalXpText}>+50 XP BONUS</Text>
            </View>

            <DuoButton
              title="Awesome!"
              onPress={() => setShowGoalModal(false)}
              color={Colors.primary}
              size="medium"
              style={{ width: '100%' }}
            />
            
            <TouchableOpacity 
              style={styles.shareLink}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              }}
            >
              <Ionicons name="share-outline" size={18} color={Colors.primary} />
              <Text style={styles.shareLinkText}>SHARE SUCCESS</Text>
            </TouchableOpacity>
          </AnimatedCard>
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  bannerContainer: {
    marginBottom: 24,
    marginTop: 8,
  },
  bannerCard: {
    backgroundColor: Colors.accent,
    borderRadius: 32,
    padding: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 10,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    position: 'relative',
    overflow: 'hidden',
  },
  bannerCircle: {
    position: 'absolute',
    backgroundColor: Colors.white,
    opacity: 0.1,
    borderRadius: 100,
  },
  bannerBadge: {
    backgroundColor: Colors.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderBottomWidth: 4,
  },
  bannerBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.white,
    lineHeight: 28,
    marginBottom: 8,
  },
  bannerSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
    marginBottom: 20,
  },
  bannerCTA: {
    backgroundColor: Colors.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  bannerCTAText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bannerImageContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerIconFloating: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 0.2,
    transform: [{ rotate: '-15deg' }, { scale: 1.5 }],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  profileIconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  motivationSection: {
    marginBottom: 24,
  },
  motivationCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  motivationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  motivationEmojiContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  motivationEmoji: {
    fontSize: 32,
  },
  motivationMessage: {
    flex: 1,
  },
  motivationTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  motivationSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  progressIndicator: {
    height: 14,
    backgroundColor: Colors.border,
    borderRadius: 7,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 7,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  standardCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
  },
  caloriesTarget: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  caloriesCircle: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    borderBottomWidth: 6,
  },
  percentageText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primary,
  },
  progressBarContainer: {
    height: 16,
    backgroundColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  caloriesProgressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  caloriesFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  caloriesStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  caloriesStatText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  macroContent: {
    // No extra padding
  },
  pieChartContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pieChartCenter: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
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
    color: Colors.text,
  },
  legendValue: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 8, 8, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  goalModalContent: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: 12,
  },
  goalEmojiWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: Colors.border,
    position: 'relative',
  },
  goalEmoji: {
    fontSize: 50,
  },
  sparkle: {
    position: 'absolute',
  },
  goalModalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  goalModalTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    lineHeight: 32,
  },
  goalModalText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '700',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  goalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  goalStatItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  goalStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  goalStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  goalStatDivider: {
    width: 2,
    height: 30,
    backgroundColor: Colors.border,
    marginHorizontal: 20,
  },
  goalXpWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.warning + '30',
  },
  xpIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalXpText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.warning,
  },
  shareLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    padding: 10,
  },
  shareLinkText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 1,
  },
  chartContent: {
    alignItems: 'center',
  },
});
