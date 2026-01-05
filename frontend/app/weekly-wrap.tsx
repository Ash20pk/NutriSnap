import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Share,
  Dimensions,
  Animated,
  StatusBar,
  Pressable,
  Easing,
  Alert,
} from 'react-native';
import { Colors } from '../constants/Colors';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedCard from '../components/AnimatedCard';
import DuoButton from '../components/DuoButton';

const { width, height: screenHeight } = Dimensions.get('window');

const SLIDE_DURATION = 5000; // 5 seconds per slide

export default function WeeklyWrapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const [weeklyStats, setWeeklyStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [captureMode, setCaptureMode] = useState(false);
  const screenCaptureRef = useRef<View>(null);
  const shareCardRef = useRef<View>(null);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const floatingAnim = useRef(new Animated.Value(0)).current;
  const rotatingAnim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;

  const slides = useMemo(() => [
    {
      id: 'intro',
      title: 'Your Week\nin Review',
      subtitle: 'NutriSnap Wrapped 2024',
      gradient: [Colors.primary, Colors.accent] as const,
      icon: 'sparkles',
    },
    {
      id: 'meals',
      title: 'Meal Maven',
      value: weeklyStats?.totalMeals || 0,
      label: 'Meals Logged',
      description: (weeklyStats?.totalMeals || 0) > 15 ? "You're a logging machine!" : "Keeping track of every bite.",
      gradient: [Colors.warning, '#D35400'] as const,
      icon: 'restaurant',
    },
    {
      id: 'calories',
      title: 'Daily Fuel',
      value: weeklyStats?.avgCalories || 0,
      label: 'Avg kcal / day',
      description: weeklyStats?.avgCalories < (user?.daily_calorie_target || 2000) 
        ? "You're keeping it light! Great job." 
        : "Fueling that engine for greatness.",
      gradient: [Colors.primary, Colors.primaryLight] as const,
      icon: 'flame',
    },
    {
      id: 'macros',
      title: 'Macro\nMastery',
      macros: [
        { label: 'PRO', value: weeklyStats?.totalProtein, color: Colors.protein },
        { label: 'CHO', value: weeklyStats?.totalCarbs, color: Colors.carbs },
        { label: 'FAT', value: weeklyStats?.totalFat, color: Colors.fat },
      ],
      description: "Balance is your superpower.",
      gradient: [Colors.accent, Colors.accentLight] as const,
      icon: 'pie-chart',
    },
    {
      id: 'foods',
      title: 'The Usual\nSuspects',
      foods: weeklyStats?.topFoods || [],
      description: "Your taste buds have a type!",
      gradient: [Colors.warning, Colors.highLevels] as const,
      icon: 'heart',
    },
    {
      id: 'archetype',
      title: 'Your Nutri\nPersona',
      value: weeklyStats?.archetype?.name,
      label: 'Archetype',
      description: weeklyStats?.archetype?.desc,
      gradient: [Colors.primary, Colors.accent] as const,
      icon: (weeklyStats?.archetype?.icon as any) || 'person',
    },
    {
      id: 'consistency',
      title: 'Consistency\nKing',
      value: `${weeklyStats?.consistency || 0}%`,
      label: 'Weekly Goal Hit',
      description: (weeklyStats?.consistency || 0) > 80 ? "Unstoppable momentum!" : "Progress, not perfection.",
      gradient: [Colors.success, Colors.primaryLight] as const,
      icon: 'checkmark-circle',
    },
    {
      id: 'summary',
      title: '',
      gradient: [Colors.primary, Colors.black] as const,
      icon: 'trophy',
    }
  ], [weeklyStats, user?.daily_calorie_target]);

  useEffect(() => {
    if (currentSlide === slides.length - 1) {
      confettiAnim.setValue(0);
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      }).start();
    }
  }, [currentSlide, slides.length, confettiAnim]);

  useEffect(() => {
    Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatingAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(floatingAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.timing(rotatingAnim, {
          toValue: 1,
          duration: 10000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
    ]).start();
  }, [floatingAnim, rotatingAnim]);

  const fetchWeeklyStats = useCallback(async () => {
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
        
        const type = meal.meal_type as keyof typeof mealCounts;
        if (mealCounts.hasOwnProperty(type)) {
          mealCounts[type]++;
        }
        
        meal.foods.forEach((food: any) => {
          topFoods[food.name] = (topFoods[food.name] || 0) + 1;
        });
      });

      const topFoodsList = Object.entries(topFoods)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([name]) => name);

      // Calculate Archetype
      const pKcal = totalProtein * 4;
      const cKcal = totalCarbs * 4;
      const fKcal = totalFat * 9;
      const totalMacroKcal = pKcal + cKcal + fKcal;
      
      let archetype = { name: 'The Balancer', icon: 'scale', desc: 'You keep your macros in perfect harmony.' };
      if (totalMacroKcal > 0) {
        const pPct = (pKcal / totalMacroKcal) * 100;
        const cPct = (cKcal / totalMacroKcal) * 100;
        const fPct = (fKcal / totalMacroKcal) * 100;

        if (pPct > 30) archetype = { name: 'Protein Pro', icon: 'fitness', desc: 'Muscle building is your middle name.' };
        else if (cPct > 55) archetype = { name: 'Carb Crusader', icon: 'leaf', desc: 'Fueling your energy with nature’s best.' };
        else if (fPct > 40) archetype = { name: 'Fat Fanatic', icon: 'water', desc: 'You know healthy fats are the secret sauce.' };
      }

      setWeeklyStats({
        totalMeals: history.meals.length,
        avgCalories: Math.round(totalCalories / 7),
        totalProtein: Math.round(totalProtein),
        totalCarbs: Math.round(totalCarbs),
        totalFat: Math.round(totalFat),
        topFoods: topFoodsList,
        mealCounts,
        consistency: Math.round((history.meals.length / 21) * 100),
        archetype,
      });
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchWeeklyStats();
    }
  }, [user, fetchWeeklyStats]);

  const nextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCurrentSlide(prev => prev + 1);
    } else {
      router.back();
    }
  }, [currentSlide, slides.length, router]);

  const prevSlide = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

  const startSlideTimer = useCallback(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && currentSlide < slides.length - 1) {
        nextSlide();
      }
    });
  }, [currentSlide, slides.length, progressAnim, nextSlide]);

  useEffect(() => {
    if (!loading && weeklyStats) {
      startSlideTimer();
    }
    return () => progressAnim.stopAnimation();
  }, [loading, currentSlide, weeklyStats, startSlideTimer, progressAnim]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      setCaptureMode(true);

      // Wait a frame so UI hides before capture
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));

      if (Platform.OS === 'ios') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'We need permission to save the image to your library');
          setSharing(false);
          setCaptureMode(false);
          return;
        }
      }

      const uri = await captureRef(screenCaptureRef, {
        format: 'png',
        quality: 0.9,
      });
      
      if (Platform.OS === 'ios') {
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      
      await Share.share({
        url: Platform.OS === 'android' && !String(uri).startsWith('file://') ? `file://${uri}` : uri,
        title: 'My Weekly NutriSnap',
        message: `My Weekly NutriSnap Wrapped!\n\nConsistency: ${weeklyStats?.consistency || 0}%\n\n#NutriSnap #WeeklyWrap`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Sharing failed', 'Something went wrong while trying to share your wrap.');
    } finally {
      setSharing(false);
      setCaptureMode(false);
    }
  }, [weeklyStats]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={[Colors.primary, Colors.accent]} style={StyleSheet.absoluteFill} />
        <View style={styles.loadingContent}>
          <Ionicons name="nutrition" size={60} color={Colors.white} />
          <Text style={styles.loadingText}>Preparing your wrap...</Text>
        </View>
      </View>
    );
  }

  const slide = slides[currentSlide];

  const baseWidth = 390;
  const baseHeight = 844;
  const scale = Math.min(width / baseWidth, screenHeight / baseHeight);
  const titleFontSize = Math.max(32, Math.min(48, Math.round(48 * scale)));
  const valueFontSize = Math.max(54, Math.min(80, Math.round(80 * scale)));
  const valueLineHeight = Math.round(valueFontSize * 1.02);
  const iconLg = Math.max(70, Math.min(100, Math.round(100 * scale)));
  const iconSm = Math.max(56, Math.min(80, Math.round(80 * scale)));
  const slideHPad = Math.max(18, Math.min(40, Math.round(40 * scale)));
  const slideVPad = Math.max(14, Math.min(22, Math.round(22 * scale)));
  const iconMarginBottom = Math.max(18, Math.min(40, Math.round(40 * scale)));
  const valueMarginBottom = Math.max(16, Math.min(30, Math.round(30 * scale)));
  const descriptionFontSize = Math.max(16, Math.min(20, Math.round(20 * scale)));
  const macroValFontSize = Math.max(16, Math.min(20, Math.round(20 * scale)));
  const macroLabFontSize = Math.max(10, Math.min(12, Math.round(12 * scale)));
  const macroPad = Math.max(10, Math.min(15, Math.round(15 * scale)));
  const foodFontSize = Math.max(14, Math.min(18, Math.round(18 * scale)));
  const foodRowPad = Math.max(10, Math.min(15, Math.round(15 * scale)));
  const summaryCardWidth = Math.min(width * 0.86, 360);
  const summaryCardMaxHeight = Math.min(screenHeight * 0.62, 520);
  const topOffset = Platform.OS === 'ios' ? insets.top : insets.top + 10;
  const bottomOffset = insets.bottom;

  const isSummary = slide.id === 'summary';
  const isConsistency = slide.id === 'consistency';
  const titleFontSizeFinal = isConsistency ? Math.max(24, Math.round(titleFontSize * 0.82)) : titleFontSize;
  const titleLineHeightFinal = Math.round(titleFontSizeFinal * 1.08);
  const iconLgFinal = isConsistency ? Math.max(62, Math.round(iconLg * 0.9)) : iconLg;
  const iconSmFinal = isConsistency ? Math.max(50, Math.round(iconSm * 0.9)) : iconSm;
  const iconMarginBottomFinal = isSummary ? Math.max(6, Math.round(iconMarginBottom * 0.25)) : iconMarginBottom;
  const valueMarginBottomFinal = isConsistency ? Math.max(10, Math.round(valueMarginBottom * 0.7)) : valueMarginBottom;
  const slideVPadFinal = isSummary ? Math.max(8, Math.round(slideVPad * 0.7)) : slideVPad;

  return (
    <View ref={screenCaptureRef} collapsable={false} style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <LinearGradient colors={slide.gradient as any} style={StyleSheet.absoluteFill} />

      {/* Decorative Background Elements */}
      <Animated.View 
        style={[
          styles.decorativeCircle,
          {
            top: -100,
            left: -100,
            transform: [
              {
                translateX: floatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 20],
                }),
              },
              {
                rotate: rotatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]} 
      />
      <Animated.View 
        style={[
          styles.decorativeCircle,
          {
            bottom: -50,
            right: -50,
            width: 300,
            height: 300,
            opacity: 0.1,
            transform: [
              {
                translateY: floatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -30],
                }),
              },
              {
                rotate: rotatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['360deg', '0deg'],
                }),
              },
            ],
          },
        ]} 
      />
      <Animated.View 
        style={[
          styles.decorativeTriangle,
          {
            top: 200,
            right: -20,
            opacity: 0.05,
            transform: [
              {
                rotate: rotatingAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]} 
      />

      {/* Confetti Particles */}
      {currentSlide === slides.length - 1 && !isSummary && [...Array(20)].map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.confetti,
            {
              left: `${Math.random() * 100}%`,
              backgroundColor: [Colors.primary, Colors.accent, Colors.warning, Colors.protein, Colors.carbs][i % 5],
              transform: [
                {
                  translateY: confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, screenHeight + 50],
                  }),
                },
                {
                  rotate: confettiAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${Math.random() * 360 + 360}deg`],
                  }),
                },
                {
                  translateX: Math.sin(i) * 50,
                }
              ],
              opacity: confettiAnim.interpolate({
                inputRange: [0, 0.8, 1],
                outputRange: [1, 1, 0],
              }),
            },
          ]}
        />
      ))}

      {!captureMode && (
        <>
          {/* Progress Bars */}
          <View style={[styles.progressContainer, { paddingTop: topOffset + 14 }]}>
            {slides.map((_, index) => (
              <View key={index} style={styles.progressBarBg}>
                <Animated.View 
                  style={[
                    styles.progressBarFill, 
                    { 
                      width: index === currentSlide 
                        ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                        : index < currentSlide ? '100%' : '0%' 
                    }
                  ]} 
                />
              </View>
            ))}
          </View>

          {/* Close Button */}
          <TouchableOpacity style={[styles.closeButton, { top: topOffset + 34 }]} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
        </>
      )}

      {/* Slide Content */}
      <AnimatedCard
        key={currentSlide}
        type="slide"
        style={[
          styles.slideContent,
          {
            paddingHorizontal: slideHPad,
            paddingTop: slideVPadFinal,
            paddingBottom: slideVPadFinal,
            justifyContent: isSummary ? 'flex-start' : styles.slideContent.justifyContent,
          },
        ]}
      >
        {!isSummary && (
          <>
            <Animated.View 
              style={[
                styles.iconContainer,
                { marginBottom: iconMarginBottomFinal },
                {
                  transform: [
                    {
                      translateY: floatingAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -15],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons name={slide.icon as any} size={iconSmFinal} color="rgba(255,255,255,0.3)" style={styles.floatingIcon} />
              <Ionicons name={slide.icon as any} size={iconLgFinal} color={Colors.white} />
            </Animated.View>

            {!!slide.title && (
              <Text
                style={[styles.slideTitle, { fontSize: titleFontSizeFinal, lineHeight: titleLineHeightFinal }]}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                numberOfLines={2}
                ellipsizeMode="clip"
              >
                {slide.title}
              </Text>
            )}
          </>
        )}
        
        {slide.value !== undefined && (
          <View style={[styles.valueContainer, { marginBottom: valueMarginBottomFinal }]}
          >
            <Text
              style={[styles.slideValue, { fontSize: valueFontSize, lineHeight: valueLineHeight }]}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              numberOfLines={1}
            >
              {slide.value}
            </Text>
            <Text
              style={styles.slideLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {slide.label}
            </Text>
          </View>
        )}

        {slide.macros && (
          <View style={styles.macrosContainer}>
            {slide.macros.map((m, i) => (
              <View key={i} style={[styles.macroBox, { padding: macroPad, minWidth: Math.max(70, Math.round(80 * scale)) }]}>
                <Text style={[styles.macroVal, { fontSize: macroValFontSize }]}>{m.value}g</Text>
                <Text style={[styles.macroLab, { fontSize: macroLabFontSize }]}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}

        {slide.foods && (
          <View style={styles.foodsContainer}>
            {slide.foods.map((food: string, i: number) => (
              <View key={i} style={[styles.foodRow, { padding: foodRowPad }]}>
                <View style={styles.foodRank}><Text style={styles.foodRankText}>{i+1}</Text></View>
                <Text style={[styles.foodName, { fontSize: foodFontSize }]} numberOfLines={1}>
                  {food}
                </Text>
              </View>
            ))}
          </View>
        )}

        {slide.description && (
          <Text
            style={[styles.slideDescription, { fontSize: descriptionFontSize, lineHeight: Math.round(descriptionFontSize * 1.35) }]}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {slide.description}
          </Text>
        )}

        {slide.id === 'summary' && (
          <View
            style={[
              styles.summarySlide,
              {
                paddingBottom: captureMode ? 0 : Math.max(16, bottomOffset + 16),
              },
            ]}
          >
            <View style={styles.summaryCenter}>
              <View
                ref={shareCardRef}
                collapsable={false}
                style={[
                  styles.summaryCard,
                  {
                    width: summaryCardWidth,
                    maxHeight: summaryCardMaxHeight,
                    aspectRatio: undefined as any,
                  },
                ]}
              >
              <LinearGradient 
                colors={[Colors.primary, Colors.accent, Colors.secondary]} 
                style={styles.summaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              
              {/* Card Watermark Background */}
              <View style={styles.cardWatermark}>
                <Ionicons name="nutrition" size={200} color="rgba(255,255,255,0.05)" />
              </View>

              <View style={styles.summaryHeader}>
                <View style={styles.summaryHeaderLeft}>
                  <View style={styles.smallAvatar}>
                    <Text style={styles.smallAvatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.summaryUser}>{user?.name}</Text>
                    <Text style={styles.summaryYear}>WEEKLY WRAPPED</Text>
                  </View>
                </View>
                <Ionicons name="nutrition" size={24} color={Colors.white} />
              </View>
              
              <View style={styles.summaryStats}>
                <View style={styles.sumStatRow}>
                  <View style={styles.sumStat}>
                    <Text style={styles.sumVal}>{weeklyStats?.totalMeals || 0}</Text>
                    <Text style={styles.sumLab}>MEALS LOGGED</Text>
                  </View>
                  <View style={styles.sumStat}>
                    <Text style={styles.sumVal}>{weeklyStats?.consistency || 0}%</Text>
                    <Text style={styles.sumLab}>GOAL HIT</Text>
                  </View>
                </View>

                <View style={styles.sumStatRow}>
                  <View style={styles.sumStat}>
                    <Text style={styles.sumValSmall}>{weeklyStats?.avgCalories || 0}</Text>
                    <Text style={styles.sumLab}>AVG KCAL</Text>
                  </View>
                  <View style={styles.sumStat}>
                    <Text style={styles.sumValSmall}>{weeklyStats?.totalProtein || 0}g</Text>
                    <Text style={styles.sumLab}>PROTEIN</Text>
                  </View>
                </View>
              </View>

              <View style={styles.sumTopFoodsCard}>
                <Text style={styles.sumTitle}>MY TOP FOODS</Text>
                {weeklyStats?.topFoods.map((f: string, i: number) => (
                  <View key={i} style={styles.sumFoodRow}>
                    <Text style={styles.sumFoodRank}>{i+1}</Text>
                    <Text style={styles.sumFoodName}>{f}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.footerBrand}>NUTRISNAP</Text>
                <View style={styles.footerDivider} />
                <Text style={styles.footerTagline}>AI NUTRITION TRACKER</Text>
              </View>
              </View>
            </View>

            {!captureMode && (
              <View style={styles.summaryBottom}>
                <DuoButton 
                  title={sharing ? 'PREPARING...' : 'SHARE WRAPPED'}
                  onPress={handleShare}
                  color={Colors.white}
                  shadowColor="rgba(0,0,0,0.1)"
                  textStyle={{ color: Colors.primary }}
                  style={styles.shareButton}
                  disabled={sharing}
                />
              </View>
            )}
          </View>
        )}
      </AnimatedCard>

      {/* Navigation Areas */}
      <View style={styles.navContainer} pointerEvents={isSummary || captureMode ? 'none' : 'auto'}>
        <Pressable style={styles.navSide} onPress={prevSlide} />
        <Pressable style={styles.navSide} onPress={nextSlide} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  loadingContent: {
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    gap: 4,
    zIndex: 100,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.white,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 80 : 60,
    right: 20,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 50,
  },
  navSide: {
    flex: 1,
  },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingIcon: {
    position: 'absolute',
    opacity: 0.2,
    transform: [{ scale: 1.5 }],
  },
  slideTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 52,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  valueContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  slideValue: {
    fontSize: 80,
    fontWeight: '900',
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  slideLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  slideDescription: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 28,
  },
  macrosContainer: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
  },
  macroBox: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    minWidth: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  macroVal: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.white,
  },
  macroLab: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  foodsContainer: {
    width: '100%',
    marginTop: 20,
    gap: 12,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 20,
    gap: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  foodRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  foodRankText: {
    color: Colors.primary,
    fontWeight: '900',
    fontSize: 18,
  },
  foodName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
    textTransform: 'uppercase',
  },
  summaryContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  summarySlide: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  summaryCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBottom: {
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 12,
  },
  summaryCard: {
    width: width * 0.8,
    aspectRatio: 0.7,
    borderRadius: 32,
    overflow: 'hidden',
    padding: 30,
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  summaryGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  smallAvatarText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  summaryUser: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryYear: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  summaryStats: {
    gap: 15,
    marginVertical: 10,
  },
  sumStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  sumStat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sumVal: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.white,
  },
  sumValSmall: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.white,
  },
  sumLab: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginTop: 4,
  },
  sumTopFoodsCard: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 20,
    borderRadius: 24,
    marginTop: 10,
  },
  sumTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
    letterSpacing: 1,
  },
  sumFoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sumFoodRank: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.white,
    opacity: 0.5,
    width: 15,
  },
  sumFoodName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
    textTransform: 'uppercase',
  },
  cardWatermark: {
    position: 'absolute',
    right: -50,
    bottom: -50,
    opacity: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 10,
  },
  footerBrand: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footerDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  footerTagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  shareButton: {
    marginTop: 0,
    width: '100%',
  },
  decorativeCircle: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(255,255,255,0.05)',
    zIndex: 0,
  },
  decorativeTriangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 100,
    borderRightWidth: 100,
    borderBottomWidth: 173,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 0,
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 100,
  },
});
