import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { mealApi, Meal, waterApi, WaterToday } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import PageHeader from '../../components/PageHeader';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { format } from 'date-fns';

import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import LoadingState from '../../components/LoadingState';
import MealActionsSheet from '../../components/MealActionsSheet';
import AppCard from '../../components/AppCard';
import EmptyState from '../../components/EmptyState';

const MEAL_CONFIG = {
  breakfast: { icon: 'sunny',        color: '#F28D35', label: 'Breakfast' },
  lunch:     { icon: 'partly-sunny', color: '#2F593E', label: 'Lunch'     },
  dinner:    { icon: 'moon',         color: '#5B6AF0', label: 'Dinner'    },
  snack:     { icon: 'cafe',         color: '#8B7A6A', label: 'Snack'     },
} as const;

export default function LogScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useUser();
  const searchInputRef = useRef<TextInput>(null);
  const ENABLE_CAMERA_LOGGING = true;
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [logMethod, setLogMethod] = useState<'photo' | 'manual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const [todayStats, setTodayStats] = useState<any>(null);
  const [waterData, setWaterData] = useState<WaterToday | null>(null);
  const [waterLoading, setWaterLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [configuringFood, setConfiguringFood] = useState<any | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [configQty, setConfigQty] = useState('');
  const [configUnit, setConfigUnit] = useState<'g' | 'oz'>('g');
  const [mealNotes, setMealNotes] = useState('');
  const [manualParseLoading, setManualParseLoading] = useState(false);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [clarificationRequestedName, setClarificationRequestedName] = useState<string | null>(null);

  const fetchTodayData = useCallback(async () => {
    if (!user) return;
    try {
      const [result, stats, water] = await Promise.all([
        mealApi.getHistory(user.id, 2),
        mealApi.getStats(user.id),
        waterApi.getToday(user.id),
      ]);
      const today = new Date().toDateString();
      const todays = (result.meals as Meal[]).filter(
        m => new Date((m as any).timestamp || (m as any).logged_at).toDateString() === today
      );
      setTodayMeals(todays);
      setTodayStats(stats);
      setWaterData(water);
    } catch (e) {
      console.error('Error fetching today data:', e);
    }
  }, [user]);

  const handleLogWater = useCallback(async (amountMl: number) => {
    if (!user) return;
    setWaterLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await waterApi.logWater(user.id, amountMl);
      const water = await waterApi.getToday(user.id);
      setWaterData(water);
    } catch (e) {
      console.error('Error logging water:', e);
      Alert.alert('Error', 'Failed to log water intake');
    } finally {
      setWaterLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTodayData();
  }, [fetchTodayData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTodayData();
    setRefreshing(false);
  }, [fetchTodayData]);

  useEffect(() => {
    const openMode = typeof params?.openMode === 'string' ? params.openMode : '';
    const barcodeFoodRaw = typeof params?.barcodeFood === 'string' ? params.barcodeFood : '';
    if (!openMode && !barcodeFoodRaw) return;

    // Always open the modal when coming from barcode scan.
    setLogMethod('manual');
    setShowModal(true);

    if (openMode === 'portion' && barcodeFoodRaw) {
      try {
        const food = JSON.parse(barcodeFoodRaw);
        setSelectedFoods([]);
        setConfiguringFood(food);
        setEditingIndex(null);
        setConfigQty('100');
        setConfigUnit('g');
      } catch (e) {
        console.warn('Failed to parse barcodeFood param', e);
      }
    }
    if (openMode === 'voice') {
      setUsedVoice(true);
      setMealNotes('');
    }
    // openMode === 'voice' just opens the modal in voice UI
  }, [params?.openMode, params?.barcodeFood]);

  const voiceTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (voiceLoading) {
      Animated.timing(voiceTranslateY, {
        toValue: -20,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(voiceTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [voiceLoading, voiceTranslateY]);

  useEffect(() => {
    if (showModal && !configuringFood) {
      const t = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [showModal, configuringFood]);

  useEffect(() => {
    if (!showModal) {
      setVoiceLoading(false);
      setIsRecording(false);
      setRecording(null);
      setMealNotes('');
      setUsedVoice(false);
      setClarificationQuestion(null);
      setClarificationRequestedName(null);
    }
  }, [showModal]);

  const getClarificationPrompt = () => {
    const base = (clarificationRequestedName || '').trim();
    const baseType = base ? base.split(' ').slice(-1).join(' ') : 'burrito';
    const example = `"small chicken ${baseType} with cheese"`;
    return `Please say it again with size + filling + extras (if any). For example: ${example}.`;
  };

  const mealTypes: { id: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string; icon: string }[] = [
    { id: 'breakfast', label: 'Breakfast', icon: 'sunny' },
    { id: 'lunch', label: 'Lunch', icon: 'restaurant' },
    { id: 'dinner', label: 'Dinner', icon: 'moon' },
    { id: 'snack', label: 'Snack', icon: 'fast-food' },
  ];

  const handlePhotoLog = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }

      router.push('/camera');
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      Alert.alert('Error', 'Failed to access camera');
    }
  };

  const analyzeManualText = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }
    const text = (mealNotes || '').trim();
    if (!text) {
      Alert.alert('Describe your food', 'Type what you ate first.');
      return;
    }
    try {
      setManualParseLoading(true);
      const res = await mealApi.textToMeal(text, user.id);
      const foods = res?.foods || [];
      if (!foods.length) {
        Alert.alert('No foods detected', 'Try being more specific (include quantities if you can).');
        return;
      }
      setSelectedFoods(foods);
    } catch (e) {
      console.error('Text-to-meal failed:', e);
      Alert.alert('Error', 'Failed to analyze text. Try again.');
    } finally {
      setManualParseLoading(false);
    }
  };

  const handleManualLog = () => {
    setUsedVoice(false);
    setLogMethod('manual');
    setShowModal(true);
  };

  const startVoiceRecording = async () => {
    if (voiceLoading || isRecording) return;
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to use voice logging');
      return;
    }

    try {
      setVoiceLoading(true);

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice logging');
        setVoiceLoading(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();

      setRecording(rec);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e) {
      console.error('Failed to start recording:', e);
      Alert.alert('Error', 'Failed to start recording');
      setRecording(null);
      setIsRecording(false);
    } finally {
      setVoiceLoading(false);
    }
  };

  const stopVoiceRecordingAndParse = async () => {
    if (voiceLoading || !recording || !user?.id) return;

    try {
      setVoiceLoading(true);
      setIsRecording(false);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert('Error', 'Could not access recorded audio');
        return;
      }

      const result = await mealApi.voiceToMeal(uri, user.id);
      if (result?.needs_clarification) {
        setUsedVoice(true);
        setClarificationQuestion(result.follow_up_question || 'Can you clarify what you meant?');
        setClarificationRequestedName(result.requested_food_name || null);
        return;
      }

      const foods = result?.foods || [];

      if (foods.length === 0) {
        Alert.alert('No foods detected', 'Try speaking again');
        return;
      }

      setClarificationQuestion(null);
      setClarificationRequestedName(null);
      setSelectedFoods(foods);
      setUsedVoice(true);
    } catch (e) {
      console.error('Voice-to-meal failed:', e);
      Alert.alert('Error', 'Failed to process voice meal');
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleFoodSelect = (food: any) => {
    setConfiguringFood(food);
    setConfigQty(food.serving_size ? String(food.serving_size) : '100');
    setConfigUnit('g');
    setEditingIndex(null);
  };

  const handleEditFood = (index: number) => {
    const food = selectedFoods[index];
    setEditingIndex(index);
    setConfiguringFood(food);
    // Use displayQuantity if available (string), otherwise quantity (number)
    setConfigQty(food.displayQuantity ? String(food.displayQuantity) : String(food.quantity));
    setConfigUnit(food.displayUnit || 'g');
  };

  const getCalculatedMacros = () => {
    if (!configuringFood) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const qty = parseFloat(configQty) || 0;
    const grams = configUnit === 'oz' ? qty * 28.3495 : qty;
    const ratio = grams / 100;
    
    return {
      calories: Math.round(configuringFood.calories_per_100g * ratio),
      protein: Math.round(configuringFood.protein_per_100g * ratio),
      carbs: Math.round(configuringFood.carbs_per_100g * ratio),
      fat: Math.round(configuringFood.fat_per_100g * ratio),
      grams: Math.round(grams),
    };
  };

  const confirmAddFood = () => {
    if (!configuringFood) return;
    
    const macros = getCalculatedMacros();
    const newFood = {
      ...configuringFood,
      name: configuringFood.name,
      quantity: macros.grams, // Backend expects grams typically
      displayQuantity: configQty,
      displayUnit: configUnit,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    };
    
    if (editingIndex !== null) {
      const updated = [...selectedFoods];
      updated[editingIndex] = newFood;
      setSelectedFoods(updated);
      setEditingIndex(null);
    } else {
      setSelectedFoods([...selectedFoods, newFood]);
    }

    setConfiguringFood(null);
    setSearchResults([]);
  };

  const removeFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const saveMeal = async () => {
    if (selectedFoods.length === 0) {
      Alert.alert('No Foods', 'Please add at least one food item');
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      await mealApi.logMeal({
        user_id: user.id,
        meal_type: mealType,
        foods: selectedFoods,
        logging_method: logMethod || 'manual',
        notes: usedVoice ? undefined : (mealNotes || '').trim() || undefined,
      });

      setSelectedFoods([]);
      setShowModal(false);
      setLogMethod(null);
      setEditingIndex(null);
      setMealNotes('');
    } catch (error) {
      console.error('Error logging meal:', error);
      Alert.alert('Error', 'Failed to log meal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader 
        title="Log Your Meal" 
        subtitle="Track your nutrition"
        rightComponent={
          <TouchableOpacity
            style={styles.headerBtn}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
      >
        {/* Today's Energy — same card as home screen */}
        {(() => {
          const eaten = Math.round(todayStats?.total_calories || 0);
          const target = Math.round(todayStats?.targets?.calories || 2000);
          const pct = Math.min(1, eaten / target);
          const goalMet = pct >= 0.8 && pct <= 1.2;
          return (
            <View style={styles.overviewCard}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: goalMet ? Colors.success + '15' : theme.primary + '10', width: `${Math.min(100, pct * 100)}%` },
                ]}
              />
              <View style={styles.overviewTopRow}>
                <Text style={styles.overviewLabel}>Today&apos;s Energy</Text>
              </View>
              <View style={styles.overviewEnergyMain}>
                <View style={styles.overviewEnergyLeft}>
                  <Text style={styles.overviewEnergyLarge}>{eaten.toLocaleString()}</Text>
                  <Text style={styles.overviewEnergyStatLabel}>Eaten</Text>
                </View>
                <View style={styles.overviewEnergyRight}>
                  <Text style={styles.overviewEnergyLarge}>{target.toLocaleString()}</Text>
                  <Text style={styles.overviewEnergyStatLabel}>Target</Text>
                </View>
              </View>
              <View style={styles.overviewMacroStrip}>
                {[
                  { label: 'Pro',  val: Math.round(todayStats?.total_protein || 0), color: Colors.protein },
                  { label: 'Carb', val: Math.round(todayStats?.total_carbs   || 0), color: Colors.carbs   },
                  { label: 'Fat',  val: Math.round(todayStats?.total_fat      || 0), color: Colors.fat     },
                ].map(m => (
                  <View key={m.label} style={styles.overviewMacroItem}>
                    <Text style={[styles.overviewMacroValue, { color: m.color }]}>{m.val}g</Text>
                    <Text style={styles.overviewMacroLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Water Intake */}
        <AnimatedCard delay={150} type="slide" style={styles.glanceSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hydration</Text>
            {waterLoading && <ActivityIndicator size="small" color="#2196F3" />}
          </View>
          <AppCard padding={20} style={styles.waterCard}>
            <View style={styles.waterMainRow}>
              <View style={styles.waterIconWrap}>
                <Ionicons name="water" size={36} color="#2196F3" />
              </View>
              <View style={styles.waterInfo}>
                <View style={styles.waterTextRow}>
                  <Text style={styles.waterAmount}>
                    {Math.round(waterData?.total_ml || 0)}
                    <Text style={styles.waterUnit}> ml</Text>
                  </Text>
                  <Text style={styles.waterTarget}>
                    of {Math.round(waterData?.goal_ml || 2500)} ml
                  </Text>
                </View>
                <View style={styles.waterBarTrack}>
                  <View
                    style={[
                      styles.waterBarFill,
                      { width: `${Math.min(100, waterData?.percentage || 0)}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
            <View style={styles.waterButtonsRow}>
              {[250, 500, 750].map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.waterBtn}
                  onPress={() => handleLogWater(amount)}
                  disabled={waterLoading}
                  activeOpacity={0.7}
                >
                  <View style={styles.waterBtnIcon}>
                    <Ionicons name="add" size={18} color="#2196F3" />
                  </View>
                  <Text style={styles.waterBtnText}>{amount}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </AppCard>
        </AnimatedCard>

        {/* Meal Type Selector */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>What are you logging?</Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.mealTypeScroll}
          contentContainerStyle={styles.mealTypeScrollContent}
        >
          {mealTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              activeOpacity={0.9}
              style={[
                styles.mealTypeCard,
                mealType === type.id && styles.mealTypeCardActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setMealType(type.id);
              }}
            >
              <View style={[
                styles.mealTypeIconContainer,
                { backgroundColor: mealType === type.id ? theme.primary + '15' : theme.backgroundSecondary }
              ]}>
                <Ionicons
                  name={type.icon as any}
                  size={32}
                  color={mealType === type.id ? theme.primary : theme.textSecondary}
                />
              </View>
              <Text
                style={[
                  styles.mealTypeLabel,
                  mealType === type.id && styles.mealTypeLabelActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Logging Methods */}
        <View style={styles.methodsContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Logging Methods</Text>
          </View>
          
          <View style={styles.methodsGrid}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.methodGridCard, { borderColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handlePhotoLog();
              }}
            >
              <View style={[styles.methodGridIcon, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="camera" size={32} color={theme.primary} />
              </View>
              <Text style={styles.methodGridTitle}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.methodGridCard, { borderColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setLogMethod('manual');
                setUsedVoice(true);
                setMealNotes('');
                setShowModal(true);
              }}
            >
              <View style={[styles.methodGridIcon, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="mic" size={32} color={theme.primary} />
              </View>
              <Text style={styles.methodGridTitle}>Voice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.methodGridCard, { borderColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/barcode');
              }}
            >
              <View style={[styles.methodGridIcon, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="barcode" size={32} color={theme.primary} />
              </View>
              <Text style={styles.methodGridTitle}>Barcode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.methodGridCard, { borderColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleManualLog();
              }}
            >
              <View style={[styles.methodGridIcon, { backgroundColor: theme.primary + '10' }]}>
                <Ionicons name="create" size={32} color={theme.primary} />
              </View>
              <Text style={styles.methodGridTitle}>Manual</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Meals */}
        <AnimatedCard delay={620} type="slide" style={styles.glanceSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today&apos;s Meals</Text>
          </View>
          {todayMeals.length > 0 ? (
            <View style={styles.mealsListGap}>
              {todayMeals.map(meal => {
                const conf = MEAL_CONFIG[meal.meal_type as keyof typeof MEAL_CONFIG] ?? MEAL_CONFIG.snack;
                const rawTs = (meal as any).timestamp || (meal as any).logged_at;
                const timeStr = (() => { try { return format(new Date(rawTs), 'h:mm a'); } catch { return ''; } })();
                return (
                  <TouchableOpacity
                    key={meal.id}
                    style={styles.mealCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedMeal(meal);
                    }}
                    activeOpacity={0.82}
                  >
                    <View style={styles.mealCardBody}>
                      <View style={styles.mealCardTopRow}>
                        <View style={[styles.mealTypeIcon, { backgroundColor: conf.color + '18' }]}>
                          <Ionicons name={conf.icon as any} size={18} color={conf.color} />
                        </View>
                        <Text style={styles.mealCardTitle}>{conf.label}</Text>
                        {(meal.foods?.length ?? 0) > 0 && (
                          <View style={[styles.mealItemsBadge, { backgroundColor: conf.color + '18' }]}>
                            <Text style={[styles.mealItemsBadgeText, { color: conf.color }]}>
                              {meal.foods!.length} {meal.foods!.length === 1 ? 'item' : 'items'}
                            </Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }} />
                        {timeStr ? <Text style={styles.mealCardTime}>{timeStr}</Text> : null}
                      </View>
                      {(meal.foods?.length ?? 0) > 0 && (
                        <Text style={styles.mealCardSub} numberOfLines={1}>
                          {meal.foods!.slice(0, 3).map((f: any) => f.name).join(' · ')}
                          {meal.foods!.length > 3 ? ` +${meal.foods!.length - 3}` : ''}
                        </Text>
                      )}
                      <View style={styles.mealCardDivider} />
                      <View style={styles.mealCardBottomRow}>
                        <View style={styles.mealMacroRow}>
                          <View style={styles.mealMacroChip}>
                            <View style={[styles.macroDot, { backgroundColor: Colors.protein }]} />
                            <Text style={styles.mealMacroText}>{(+(meal.total_protein ?? 0)).toFixed(1)}g</Text>
                          </View>
                          <View style={styles.mealMacroChip}>
                            <View style={[styles.macroDot, { backgroundColor: Colors.carbs }]} />
                            <Text style={styles.mealMacroText}>{(+(meal.total_carbs ?? 0)).toFixed(1)}g</Text>
                          </View>
                          <View style={styles.mealMacroChip}>
                            <View style={[styles.macroDot, { backgroundColor: Colors.fat }]} />
                            <Text style={styles.mealMacroText}>{(+(meal.total_fat ?? 0)).toFixed(1)}g</Text>
                          </View>
                        </View>
                        <View style={styles.mealCardCalRow}>
                          <Text style={[styles.mealCardCal, { color: conf.color }]}>{(+(meal.total_calories ?? 0)).toFixed(1)}</Text>
                          <Text style={styles.mealCardCalLabel}>kcal</Text>
                          <Ionicons name="chevron-forward" size={13} color={theme.textLight} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <AppCard padding={0} style={{ overflow: 'hidden' }}>
              <EmptyState
                icon="restaurant-outline"
                title="No meals logged yet"
                subtitle="Use the options above to log your first meal!"
              />
            </AppCard>
          )}
        </AnimatedCard>

        {/* Manual/Voice Input Modal */}
        <Modal visible={showModal} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {configuringFood ? 'Configure Food' : 'Add Foods'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (configuringFood) {
                        setConfiguringFood(null);
                      } else {
                        setShowModal(false);
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={configuringFood ? "arrow-back" : "close"} size={28} color={theme.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.modalScrollView}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                {configuringFood ? (
                  <View style={styles.configContainer}>
                    <View style={styles.configHeader}>
                      <Text style={styles.configTitle}>{configuringFood.name}</Text>
                      <Text style={styles.configSubtitle}>
                        {configuringFood.calories_per_100g} cal per 100g
                      </Text>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.qtyInputContainer}>
                        <Text style={styles.qtyLabel}>Quantity</Text>
                        <TextInput
                          style={styles.qtyInput}
                          value={configQty}
                          onChangeText={setConfigQty}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={theme.textLight}
                          selectionColor={theme.primary}
                        />
                      </View>
                      <View style={styles.unitToggle}>
                        <TouchableOpacity
                          style={[styles.unitOption, configUnit === 'g' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setConfigUnit('g');
                          }}
                        >
                          <Text style={[styles.unitText, configUnit === 'g' && styles.unitTextActive]}>g</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.unitOption, configUnit === 'oz' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setConfigUnit('oz');
                          }}
                        >
                          <Text style={[styles.unitText, configUnit === 'oz' && styles.unitTextActive]}>oz</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.macroPreview}>
                      {[
                        { label: 'Calories', value: getCalculatedMacros().calories, color: theme.primary },
                        { label: 'Protein', value: getCalculatedMacros().protein + 'g', color: Colors.protein },
                        { label: 'Carbs', value: getCalculatedMacros().carbs + 'g', color: Colors.carbs },
                        { label: 'Fat', value: getCalculatedMacros().fat + 'g', color: Colors.fat },
                      ].map((macro, i) => (
                        <View key={i} style={styles.macroCard}>
                          <Text style={[styles.macroValue, { color: macro.color }]}>{macro.value}</Text>
                          <Text style={styles.macroLabel}>{macro.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <>
                    {usedVoice && (
                      <Animated.View
                        style={[
                          styles.voiceSearchCentered,
                          { transform: [{ translateY: voiceTranslateY }] },
                        ]}
                      >
                        {!voiceLoading ? (
                          <>
                            <View style={styles.voicePromptContainerCentered}>
                              <Text style={styles.voicePromptTitle}>
                                {clarificationQuestion ? 'Quick question' : 'Tap to speak your meal'}
                              </Text>
                              <Text style={styles.voicePromptSub}>
                                {clarificationQuestion ? getClarificationPrompt() : '"2 boiled eggs and a bowl of poha"'}
                              </Text>
                              {!!clarificationRequestedName && (
                                <Text style={styles.voicePromptSub}>
                                  {`You said: ${clarificationRequestedName}`}
                                </Text>
                              )}
                            </View>

                            <TouchableOpacity
                              style={[styles.micButtonLarge, isRecording && styles.micButtonActive]}
                              onPress={() => {
                                if (isRecording) {
                                  stopVoiceRecordingAndParse();
                                } else {
                                  startVoiceRecording();
                                }
                              }}
                            >
                              <Ionicons
                                name={isRecording ? 'stop' : 'mic'}
                                size={32}
                                color={isRecording ? theme.white : theme.primary}
                              />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View style={styles.processingContainer}>
                            <LoadingState
                              label="Analyzing your meal..."
                              style={{ paddingVertical: 0 }}
                              textStyle={styles.processingText}
                            />
                          </View>
                        )}
                      </Animated.View>
                    )}

                    {!usedVoice && (
                      <Animated.View
                        style={[
                          styles.voiceSearchCentered,
                          { transform: [{ translateY: voiceTranslateY }] },
                        ]}
                      >
                        {!manualParseLoading ? (
                          <>
                            <View style={styles.voicePromptContainerCentered}>
                              <Text style={styles.voicePromptTitle}>Describe your food</Text>
                            </View>

                            <View style={styles.manualInputWrapper}>
                              <TextInput
                                ref={searchInputRef}
                                value={mealNotes}
                                onChangeText={setMealNotes}
                                placeholder="2 boiled eggs and a bowl of poha"
                                placeholderTextColor={theme.textLight}
                                selectionColor={theme.primary}
                                multiline
                                style={styles.manualInput}
                              />
                              <TouchableOpacity
                                style={[
                                  styles.analyzeButton,
                                  (!mealNotes.trim()) && styles.analyzeButtonDisabled,
                                ]}
                                onPress={analyzeManualText}
                                disabled={!mealNotes.trim()}
                                activeOpacity={0.8}
                              >
                                <Ionicons name="sparkles" size={20} color={mealNotes.trim() ? theme.white : theme.textLight} />
                              </TouchableOpacity>
                            </View>
                          </>
                        ) : (
                          <View style={styles.processingContainer}>
                            <LoadingState
                              label="Analyzing your meal..."
                              style={{ paddingVertical: 0 }}
                              textStyle={styles.processingText}
                            />
                          </View>
                        )}
                      </Animated.View>
                    )}

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <View style={styles.searchResults}>
                        {searchResults.map((food, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.searchResultItem}
                            onPress={() => handleFoodSelect(food)}
                          >
                            <View>
                              <Text style={styles.foodName}>{food.name}</Text>
                              <Text style={styles.foodInfo}>
                                {food.calories_per_100g} cal • {food.protein_per_100g}g protein
                              </Text>
                            </View>
                            <Ionicons name="add-circle" size={24} color={theme.primary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Selected Foods */}
                    {selectedFoods.length > 0 && (
                      <View style={styles.selectedFoodsContainer}>
                        <Text style={styles.selectedTitle}>Selected Foods</Text>
                        {selectedFoods.map((food, index) => (
                          <View key={index} style={styles.selectedFoodItem}>
                            <View style={styles.selectedFoodInfo}>
                              <Text style={styles.selectedFoodName}>
                                {food.name.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </Text>
                              <Text style={styles.selectedFoodDetails}>
                                {(+(food.displayQuantity || food.quantity || 0)).toFixed(1)} {food.displayUnit || 'g'} • {(+(food.calories || 0)).toFixed(1)} CAL
                              </Text>
                            </View>
                            <View style={styles.selectedFoodActions}>
                              <TouchableOpacity 
                                onPress={() => handleEditFood(index)}
                                style={styles.actionButton}
                              >
                                <Ionicons name="pencil" size={20} color={theme.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity 
                                onPress={() => removeFood(index)}
                                style={styles.actionButton}
                              >
                                <Ionicons name="close-circle" size={24} color={Colors.error} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
                </ScrollView>

                {/* Sticky Footer */}
                <View style={[styles.modalFooter, { marginTop: 'auto' }]}>
                  {configuringFood ? (
                    <View style={styles.actionRow}>
                      <DuoButton
                        title="Cancel"
                        onPress={() => setConfiguringFood(null)}
                        color={theme.white}
                        shadowColor={theme.border}
                        textStyle={{ color: theme.text }}
                        style={{ flex: 1 }}
                      />
                      <DuoButton
                        title={editingIndex !== null ? "Update Food" : "Add Food"}
                        onPress={confirmAddFood}
                        color={theme.primary}
                        style={{ flex: 2 }}
                      />
                    </View>
                  ) : (
                    <DuoButton
                      title="Save Meal"
                      onPress={saveMeal}
                      disabled={loading || selectedFoods.length === 0}
                      loading={loading}
                      color={theme.primary}
                      size="large"
                    />
                  )}
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <View style={{ height: 100 }} />
      </ScrollView>

      <MealActionsSheet
        meal={selectedMeal}
        visible={selectedMeal !== null}
        onClose={() => setSelectedMeal(null)}
        onUpdated={updated => {
          setTodayMeals(prev => prev.map(m => m.id === updated.id ? updated : m));
          fetchTodayData();
        }}
        onDeleted={id => {
          setTodayMeals(prev => prev.filter(m => m.id !== id));
          fetchTodayData();
        }}
      />
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
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mealTypeScroll: {
    marginBottom: 32,
    marginHorizontal: -24,
  },
  mealTypeScrollContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  mealTypeCard: {
    width: 100,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.border,
    borderRadius: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 6,
  },
  mealTypeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealTypeCardActive: {
    borderColor: theme.primary,
    backgroundColor: theme.white,
    borderBottomWidth: 6,
  },
  mealTypeLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealTypeLabelActive: {
    color: theme.primary,
  },
  methodsContainer: {
    marginBottom: 32,
  },
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  methodGridCard: {
    width: '48%',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderBottomWidth: 6,
    gap: 12,
  },
  methodGridIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodGridTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  modalContent: {
    backgroundColor: theme.white,
    borderRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 0,
    paddingBottom: 0,
    maxHeight: '85%',
    minHeight: 420,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 16,
    padding: 4,
    marginHorizontal: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.border,
  },
  modeToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  modeToggleButtonActive: {
    backgroundColor: theme.primary,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modeToggleTextActive: {
    color: theme.white,
  },
  modalScrollView: {
    flexGrow: 0, 
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
    backgroundColor: theme.white,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
    fontWeight: '700',
  },
  voiceSearchCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 32,
    padding: 32,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 20,
  },
  manualEntryContainer: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 32,
    padding: 30,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 20,
  },
  manualInputWrapper: {
    width: '100%',
    position: 'relative',
  },
  manualInput: {
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 16,
    paddingRight: 56,
    minHeight: 100,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    textAlignVertical: 'top',
  },
  analyzeButton: {
    position: 'absolute',
    right: 12,
    top: 29,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  analyzeButtonDisabled: {
    backgroundColor: theme.border,
    shadowOpacity: 0,
  },
  voicePromptContainerCentered: {
    alignItems: 'center',
  },
  voicePromptTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.text,
    textAlign: 'center',
  },
  voicePromptSub: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  micButtonLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.white,
    borderWidth: 3,
    borderColor: theme.border,
    borderBottomWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  micButtonDisabled: {
    backgroundColor: theme.backgroundSecondary,
    borderColor: theme.border,
    opacity: 0.6,
  },
  searchResults: {
    marginBottom: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.white,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.text,
  },
  foodInfo: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  selectedFoodsContainer: {
    marginBottom: 24,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedFoodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  selectedFoodInfo: {
    flex: 1,
  },
  selectedFoodName: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.text,
  },
  selectedFoodDetails: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  selectedFoodActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  processingText: {
    color: theme.primary,
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  configContainer: {
    gap: 20,
    marginBottom: 20,
  },
  configHeader: {
    marginBottom: 4,
  },
  configTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
  },
  configSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    height: 72,
  },
  qtyInputContainer: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: theme.border,
    justifyContent: 'center',
  },
  qtyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  qtyInput: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.text,
    height: 32,
    padding: 0,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
  },
  unitOption: {
    paddingHorizontal: 20,
    height: '100%',
    justifyContent: 'center',
    borderRadius: 14,
  },
  unitOptionActive: {
    backgroundColor: theme.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  unitText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.textLight,
  },
  unitTextActive: {
    color: theme.primary,
  },
  macroPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    backgroundColor: theme.white,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  voiceHint: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  // Today's Energy card (matches home screen)
  overviewCard: {
    marginBottom: 24,
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
  },
  overviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  overviewLabel: { fontSize: 12, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  overviewEnergyMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 16,
  },
  overviewEnergyLeft: { alignItems: 'flex-start' },
  overviewEnergyRight: { alignItems: 'flex-end' },
  overviewEnergyLarge: { fontSize: 36, fontWeight: '900', color: theme.text, letterSpacing: -1 },
  overviewEnergyStatLabel: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginTop: -2 },
  overviewMacroStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border + '40',
  },
  overviewMacroItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  overviewMacroValue: { fontSize: 14, fontWeight: '900' },
  overviewMacroLabel: { fontSize: 11, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase' },

  glanceSection: {
    marginBottom: 24,
  },
  glanceCard: {
    backgroundColor: theme.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
    padding: 20,
    gap: 12,
  },
  glanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  glanceStat: {
    flex: 1,
    alignItems: 'center',
  },
  glanceValue: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
  },
  glanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  glanceDivider: {
    width: 1,
    height: 36,
    backgroundColor: theme.border,
  },
  glanceBarTrack: {
    height: 8,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  glanceBarFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  energyMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  energyCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    borderColor: theme.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.white,
  },
  energyValue: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.text,
  },
  energyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  energyStats: {
    flex: 1,
    marginLeft: 24,
    gap: 16,
  },
  energyStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  energyStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  energyStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
  },
  energyStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  macroStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border + '50',
  },
  macroStripItem: {
    alignItems: 'center',
  },
  macroStripValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  macroStripLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  // Water intake styles
  waterCard: {
    backgroundColor: theme.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
    gap: 16,
  },
  waterMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  waterTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  waterTarget: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  waterIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#2196F315',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waterInfo: {
    flex: 1,
    gap: 6,
  },
  waterAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.text,
  },
  waterUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  waterBarTrack: {
    height: 12,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  waterBarFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  waterButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  waterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.white,
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#2196F320',
    borderBottomWidth: 4,
  },
  waterBtnIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F315',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waterBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2196F3',
  },
  mealsListGap: {
    gap: 12,
  },
  mealCard: {
    backgroundColor: theme.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
    gap: 16,
  },
  mealCardBody: {
    padding: 16,
    gap: 12,
  },
  mealCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
  },
  mealItemsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mealItemsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  mealCardTime: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textLight,
  },
  mealCardSub: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
    backgroundColor: theme.backgroundSecondary + '50',
    padding: 10,
    borderRadius: 12,
  },
  mealCardDivider: {
    height: 1,
    backgroundColor: theme.border + '50',
  },
  mealCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealMacroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  mealMacroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.backgroundSecondary + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  macroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mealMacroText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
  },
  mealCardCalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  mealCardCal: {
    fontSize: 12,
    fontWeight: '900',
  },
  mealCardCalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  });
}
