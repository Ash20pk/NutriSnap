import React, { useState, useEffect, useRef } from 'react';
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
import { fontStyles } from '../constants/Fonts';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import PageHeader from '../components/PageHeader';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';

import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';

const { width, height } = Dimensions.get('window');

export default function WeeklyWrapScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

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
    setSharing(true);
    try {
      // Capture the share card
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 0.9,
      });
      
      // Save to media library
      if (Platform.OS === 'ios') {
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      
      // Share the image
      await Share.share({
        url: Platform.OS === 'ios' ? uri : `file://${uri}`,
        title: 'My Weekly NutriSnap',
        message: `Check out my weekly nutrition summary! 📸\n\nTotal Meals: ${weeklyStats.totalMeals}\nAvg Calories: ${weeklyStats.avgCalories}\nConsistency: ${weeklyStats.consistency}%\n\n#NutriSnap #WeeklyWrap`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Preparing your wrap...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
          {/* Header */}
          <PageHeader 
            title="Weekly Snapshot" 
            subtitle={`${format(startOfWeek(new Date()), 'MMM d')} - ${format(endOfWeek(new Date()), 'MMM d, yyyy')}`}
            rightComponent={
              <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            }
          />

        {/* Stats Cards */}
        <AnimatedCard delay={100} type="pop" style={styles.statsContainer}>
          {/* Total Meals */}
          <View style={styles.card}>
            <View style={styles.statItem}>
              <Text style={styles.cardValue}>{weeklyStats.totalMeals}</Text>
              <Text style={styles.cardLabel}>Meals Logged</Text>
            </View>
          </View>

          {/* Avg Calories */}
          <View style={styles.card}>
            <View style={styles.statItem}>
              <Text style={styles.cardValue}>{weeklyStats.avgCalories}</Text>
              <Text style={styles.cardLabel}>Avg Calories/Day</Text>
            </View>
          </View>

          {/* Consistency */}
          <View style={styles.card}>
            <View style={styles.statItem}>
              <Text style={styles.cardValue}>{weeklyStats.consistency}%</Text>
              <Text style={styles.cardLabel}>Consistency</Text>
            </View>
          </View>
        </AnimatedCard>

        {/* Top Foods */}
        <AnimatedCard delay={200} type="slide" style={styles.card}>
          <Text style={styles.cardTitle}>Your Top Foods</Text>
          <View style={styles.cardContent}>
            {weeklyStats.topFoods.map((food: string, index: number) => (
              <View key={index} style={styles.topFoodItem}>
                <View style={styles.topFoodRank}>
                  <Text style={styles.topFoodRankText}>{index + 1}</Text>
                </View>
                <Text style={styles.topFoodName}>{food}</Text>
              </View>
            ))}
          </View>
        </AnimatedCard>

        {/* Macros Summary */}
        <AnimatedCard delay={300} type="slide" style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Macros</Text>
          <View style={styles.cardContent}>
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
        </AnimatedCard>

        {/* Motivational Message */}
        <AnimatedCard delay={400} type="pop" style={styles.card}>
          <View style={styles.cardContent}>
            <Text style={styles.motivationText}>
              {weeklyStats.consistency > 80 ? 
                "Amazing consistency! You're crushing it!" :
               weeklyStats.consistency > 50 ?
                "Great job this week! Keep it up!" :
                "Every meal logged is progress. Let's aim higher next week!"}
            </Text>
          </View>
        </AnimatedCard>

        {/* Share Button */}
        <AnimatedCard delay={500} type="pop" style={{ paddingHorizontal: 20, marginBottom: 40 }}>
          <DuoButton
            title={sharing ? 'Creating Card...' : 'Share Your Progress'}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              handleShare();
            }}
            disabled={sharing}
            loading={sharing}
            color={Colors.white}
            shadowColor={Colors.border}
            textStyle={{ color: Colors.primary }}
            size="large"
          />
        </AnimatedCard>

          <View style={{ height: 40 }} />
        </ScrollView>
        
        {/* Hidden Share Card for Capture */}
        <View style={styles.shareCardContainer}>
          <View ref={shareCardRef} style={styles.shareCard}>
            {/* Background Pattern */}
            <View style={styles.shareBackgroundPattern}>
              <View style={[styles.patternCircle, styles.circle1]} />
              <View style={[styles.patternCircle, styles.circle2]} />
              <View style={[styles.patternCircle, styles.circle3]} />
            </View>
            
            {/* Main Content */}
            <View style={styles.shareCardContent}>
              {/* Header */}
              <View style={styles.shareHeader}>
                <View style={styles.shareHeaderTop}>
                  <View style={styles.shareLogoContainer}>
                    <Ionicons name="nutrition" size={32} color={Colors.white} />
                    <Text style={styles.shareLogo}>NUTRISNAP</Text>
                  </View>
                  <Text style={styles.shareWeekLabel}>WEEKLY REPORT</Text>
                </View>
                <Text style={styles.shareDate}>
                  {format(startOfWeek(new Date()), 'MMM d').toUpperCase()} - {format(endOfWeek(new Date()), 'MMM d, yyyy').toUpperCase()}
                </Text>
              </View>
              
              {/* Main Stats - Simplified */}
              <View style={styles.shareMainStats}>
                <View style={styles.shareMainStatItem}>
                  <Text style={styles.shareMainStatValue}>{weeklyStats.totalProtein}g</Text>
                  <Text style={styles.shareMainStatLabel}>PROTEIN</Text>
                </View>
                <View style={styles.shareDivider} />
                <View style={styles.shareMainStatItem}>
                  <Text style={styles.shareMainStatValue}>{weeklyStats.totalCarbs}g</Text>
                  <Text style={styles.shareMainStatLabel}>CARBS</Text>
                </View>
                <View style={styles.shareDivider} />
                <View style={styles.shareMainStatItem}>
                  <Text style={styles.shareMainStatValue}>{weeklyStats.totalFat}g</Text>
                  <Text style={styles.shareMainStatLabel}>FAT</Text>
                </View>
              </View>
              
              {/* Top Foods */}
              <View style={styles.shareTopFoods}>
                <Text style={styles.shareSectionTitle}>TOP FOODS</Text>
                <View style={styles.shareFoodsList}>
                  {weeklyStats.topFoods.slice(0, 3).map((food: string, index: number) => (
                    <View key={index} style={styles.shareFoodItem}>
                      <View style={styles.shareFoodRank}>
                        <Text style={styles.shareFoodRankText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.shareFoodName}>{food}</Text>
                    </View>
                  ))}
                </View>
              </View>
              
              {/* Footer */}
              <View style={styles.shareFooter}>
                <View style={styles.shareFooterLine} />
                <Text style={styles.shareFooterText}>TRACK YOUR NUTRITION JOURNEY</Text>
                <View style={styles.shareFooterBrand}>
                  <Ionicons name="nutrition" size={16} color={Colors.white} />
                  <Text style={styles.shareFooterBrandText}>NUTRISNAP</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  statsContainer: {
    marginBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statItem: {
    alignItems: 'center',
  },
  cardContent: {
    marginTop: 8,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topFoodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    backgroundColor: Colors.backgroundSecondary,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topFoodRank: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  topFoodRankText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.white,
  },
  topFoodName: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  macroLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  motivationText: {
    fontSize: 16,
    textAlign: 'center',
    color: Colors.text,
    fontWeight: '800',
    lineHeight: 24,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: 18,
    borderWidth: 2,
    borderColor: Colors.primary,
    marginBottom: 24,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    ...fontStyles.button,
    color: Colors.primary,
  },
  loadingText: {
    ...fontStyles.body,
    color: Colors.text,
    textAlign: 'center',
  },
  // Share Card Styles 
  shareCardContainer: {
    position: 'absolute',
    left: -9999, // Position off-screen
  },
  shareCard: {
    width: 360,
    height: 640,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  shareBackgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  patternCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: Colors.primary + '10',
  },
  circle1: {
    width: 200,
    height: 200,
    top: -50,
    right: -50,
  },
  circle2: {
    width: 150,
    height: 150,
    bottom: 100,
    left: -30,
  },
  circle3: {
    width: 100,
    height: 100,
    bottom: -30,
    right: 50,
  },
  shareCardContent: {
    flex: 1,
    padding: 40,
    justifyContent: 'space-between',
  },
  shareHeader: {
    alignItems: 'center',
  },
  shareHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  shareLogoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareLogo: {
    ...fontStyles.h3,
    color: Colors.text,
    fontWeight: '700',
  },
  shareWeekLabel: {
    ...fontStyles.caption,
    fontWeight: '600',
    color: Colors.primary,
  },
  shareDate: {
    ...fontStyles.bodySmall,
    color: Colors.textSecondary,
  },
  shareMainStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: 40,
  },
  shareMainStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  shareMainStatValue: {
    ...fontStyles.stat,
    color: Colors.text,
    lineHeight: 40,
  },
  shareMainStatLabel: {
    ...fontStyles.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  shareDivider: {
    width: 1,
    height: 60,
    backgroundColor: Colors.border,
  },
  shareProgressSection: {
    marginVertical: 30,
  },
  shareProgressLabel: {
    ...fontStyles.caption,
    color: Colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  shareProgressBar: {
    height: 6,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shareProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  shareProgressText: {
    ...fontStyles.micro,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  shareTopFoods: {
    marginVertical: 20,
  },
  shareSectionTitle: {
    ...fontStyles.h4,
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  shareFoodsList: {
    gap: 8,
  },
  shareFoodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shareFoodRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareFoodRankText: {
    ...fontStyles.micro,
    fontWeight: '700',
    color: Colors.white,
  },
  shareFoodName: {
    ...fontStyles.bodySmall,
    color: Colors.text,
    fontWeight: '500',
  },
  shareFooter: {
    alignItems: 'center',
  },
  shareFooterLine: {
    width: 60,
    height: 2,
    backgroundColor: Colors.primary,
    marginBottom: 12,
  },
  shareFooterText: {
    ...fontStyles.micro,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  shareFooterBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareFooterBrandText: {
    ...fontStyles.caption,
    color: Colors.text,
    fontWeight: '600',
  },
});