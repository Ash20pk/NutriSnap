import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Dimensions,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';

const { width, height } = Dimensions.get('window');

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { id: 'lunch',     label: 'Lunch',     icon: 'partly-sunny-outline' },
  { id: 'dinner',    label: 'Dinner',    icon: 'moon-outline' },
  { id: 'snack',     label: 'Snack',     icon: 'cafe-outline' },
] as const;

type MealTypeId = typeof MEAL_TYPES[number]['id'];

export default function CameraScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useUser();
  const cameraRef = useRef<any>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [hasLiDAR, setHasLiDAR] = useState(false);
  const [lidarEnabled, setLidarEnabled] = useState(true);
  const [barcodeData, setBarcodeData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Log sheet state
  const [logSheetVisible, setLogSheetVisible] = useState(false);
  const [analyzedFoods, setAnalyzedFoods] = useState<any[]>([]);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealTypeId>('lunch');
  const [foodAmounts, setFoodAmounts] = useState<Record<number, number>>({});
  const [isLogging, setIsLogging] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');

      if (Platform.OS === 'ios') {
        try {
          const { CameraDevices } = require('react-native-vision-camera');
          const devices = CameraDevices.getAvailableCameraDevices?.() ?? [];
          const back = devices.find((d: any) => d.position === 'back');
          const supportsDepth = back?.formats?.some?.((f: any) => f.supportsDepthCapture) ?? false;
          setHasLiDAR(supportsDepth);
        } catch {
          setHasLiDAR(false);
        }
      }
    })();

    if (params?.barcodeData) {
      try {
        setBarcodeData(JSON.parse(params.barcodeData as string));
      } catch (e) {
        console.error('Error parsing barcode data:', e);
      }
    }
  }, [params]);

  const openLogSheet = (foods: any[], base64: string) => {
    const amounts: Record<number, number> = {};
    foods.forEach((f, i) => { amounts[i] = f.quantity || 100; });
    setAnalyzedFoods(foods);
    setFoodAmounts(amounts);
    setCapturedBase64(base64);
    setLogSheetVisible(true);
  };

  const closeLogSheet = () => {
    setLogSheetVisible(false);
    setAnalyzedFoods([]);
    setCapturedBase64(null);
  };

  const adjustAmount = (index: number, delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setFoodAmounts(prev => ({
      ...prev,
      [index]: Math.max(10, (prev[index] ?? 100) + delta),
    }));
  };

  const logMeal = async () => {
    if (!user || !capturedBase64) return;
    setIsLogging(true);
    try {
      const scaledFoods = analyzedFoods.map((food, i) => {
        const userQty = foodAmounts[i] ?? food.quantity ?? 100;
        const ratio = userQty / (food.quantity || 100);
        return {
          name: food.name,
          quantity: userQty,
          calories: +(food.calories * ratio).toFixed(1),
          protein:  +(food.protein  * ratio).toFixed(1),
          carbs:    +(food.carbs    * ratio).toFixed(1),
          fat:      +(food.fat      * ratio).toFixed(1),
        };
      });

      await mealApi.logMeal({
        user_id: user.id,
        meal_type: selectedMealType,
        foods: scaledFoods,
        image_base64: capturedBase64,
        logging_method: 'photo',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      console.error('Error logging meal:', e);
      setErrorMessage('Failed to log. Please try again.');
      setIsLogging(false);
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current || !user) return;
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        ...(hasLiDAR && lidarEnabled && Platform.OS === 'ios' && { enableDepthData: true }),
      });

      if (!photo.base64) throw new Error('Failed to capture image');

      // Barcode flow: skip AI analysis, go straight to log sheet with known nutrition
      if (barcodeData) {
        openLogSheet([{
          name: barcodeData.name,
          quantity: barcodeData.serving_size || 100,
          calories: barcodeData.calories,
          protein:  barcodeData.protein,
          carbs:    barcodeData.carbs,
          fat:      barcodeData.fat,
        }], photo.base64);
        return;
      }

      // Background food presence check — silent on success, inline error on failure
      const presence = await mealApi.hasFood(photo.base64, user.id);
      if (presence?.has_food === false) {
        setErrorMessage('No food detected. Adjust the frame and try again.');
        return;
      }

      // Full AI analysis — go directly to log sheet, no intermediate alert
      const analysis = await mealApi.logPhoto(photo.base64, user.id);

      if (analysis.foods && analysis.foods.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        openLogSheet(analysis.foods, photo.base64);
      } else {
        setErrorMessage('Could not identify food. Try again with better lighting.');
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      setErrorMessage('Failed to analyze image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color={Colors.error} />
        <Text style={styles.permissionText}>No access to camera</Text>
        <DuoButton title="Go Back" onPress={() => router.back()} color={theme.primary} size="medium" />
      </View>
    );
  }

  const totalCalories = analyzedFoods.reduce((sum, food, i) => {
    const qty = foodAmounts[i] ?? food.quantity ?? 100;
    const ratio = qty / (food.quantity || 100);
    return sum + food.calories * ratio;
  }, 0);

  return (
    <SafeAreaView style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.back();
            }}
          >
            <Ionicons name="close" size={28} color={theme.white} />
          </TouchableOpacity>

          {hasLiDAR && (
            <TouchableOpacity
              style={[styles.lidarBadge, lidarEnabled && styles.lidarBadgeActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setLidarEnabled(!lidarEnabled);
              }}
            >
              <Ionicons
                name={lidarEnabled ? 'cube' : 'cube-outline'}
                size={20}
                color={lidarEnabled ? theme.white : 'rgba(255,255,255,0.6)'}
              />
              <Text style={[styles.lidarText, lidarEnabled && styles.lidarTextActive]}>LiDAR</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Instruction card */}
        <View style={styles.instructionRow}>
          <AnimatedCard type="slide" delay={100} style={styles.instructionContainer}>
            <View style={styles.instructionIconWrap}>
              <Ionicons
                name={barcodeData ? 'basket-outline' : 'camera-outline'}
                size={24}
                color={theme.white}
              />
            </View>
            <Text style={styles.instructionText}>
              {barcodeData
                ? `Take a photo of your portion of ${barcodeData.name}`
                : 'Position your food clearly in the center of the frame'}
            </Text>
          </AnimatedCard>
        </View>

        {/* Aiming brackets */}
        <View style={styles.aimingOverlay}>
          <View style={styles.aimingCorner} />
          <View style={[styles.aimingCorner, styles.aimingCornerTR]} />
          <View style={[styles.aimingCorner, styles.aimingCornerBL]} />
          <View style={[styles.aimingCorner, styles.aimingCornerBR]} />
        </View>

        {/* Processing overlay — shown while hasFood + logPhoto run */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={styles.processingText}>Analysing your food…</Text>
            </View>
          </View>
        )}

        {/* Inline error banner — replaces Alert for "no food" and errors */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={18} color="#fff" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
            <TouchableOpacity onPress={() => setErrorMessage(null)}>
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Pro tip — hidden while error is shown */}
        {!barcodeData && !errorMessage && (
          <View style={styles.proTipRow}>
            <AnimatedCard type="pop" delay={300} style={styles.proTipCard}>
              <View style={styles.proTipHeader}>
                <Ionicons name="bulb" size={20} color={Colors.warning} />
                <Text style={styles.proTipTitle}>PRO TIP</Text>
              </View>
              <Text style={styles.proTipText}>
                Good lighting helps our AI identify and measure your portions accurately!
              </Text>
            </AnimatedCard>
          </View>
        )}

        {/* Capture controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setFacing(current => (current === 'back' ? 'front' : 'back'));
            }}
          >
            <Ionicons name="camera-reverse-outline" size={28} color={theme.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color={theme.white} />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          <View style={styles.controlButtonDummy} />
        </View>
      </CameraView>

      {/* ── Log Sheet overlay (outside CameraView so it covers it fully) ── */}
      {logSheetVisible && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          {/* Tappable backdrop */}
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={closeLogSheet}
          />

          <View style={styles.logSheet}>
            <View style={styles.logSheetHandle} />

            {/* Header: food count + total cals */}
            <View style={styles.logSheetHeader}>
              <View style={styles.logSheetTitleWrap}>
                <Text style={styles.logSheetTitle}>
                  {analyzedFoods.length} {analyzedFoods.length === 1 ? 'Food' : 'Foods'} Found
                </Text>
                <View style={styles.totalCalsBadge}>
                  <Text style={styles.totalCalsText}>{totalCalories.toFixed(1)} kcal total</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.logSheetCloseBtn} onPress={closeLogSheet}>
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Meal type selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.mealTypeScroll}
              contentContainerStyle={styles.mealTypeScrollContent}
            >
              {MEAL_TYPES.map(mt => (
                <TouchableOpacity
                  key={mt.id}
                  style={[styles.mealTypeChip, selectedMealType === mt.id && styles.mealTypeChipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedMealType(mt.id);
                  }}
                >
                  <Ionicons
                    name={mt.icon as any}
                    size={14}
                    color={selectedMealType === mt.id ? theme.white : theme.textSecondary}
                  />
                  <Text style={[styles.mealTypeLabel, selectedMealType === mt.id && styles.mealTypeLabelActive]}>
                    {mt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Per-food cards with serving stepper */}
            <ScrollView
              style={styles.foodList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {analyzedFoods.map((food, i) => {
                const qty = foodAmounts[i] ?? food.quantity ?? 100;
                const ratio = qty / (food.quantity || 100);
                const cals = (food.calories * ratio).toFixed(1);
                const prot = (food.protein  * ratio).toFixed(1);
                const carbs = (food.carbs   * ratio).toFixed(1);
                const fat  = (food.fat      * ratio).toFixed(1);
                return (
                  <View key={i} style={styles.foodItem}>
                    <View style={styles.foodItemTop}>
                      <View style={styles.foodItemDot} />
                      <Text style={styles.foodItemName} numberOfLines={1}>{food.name}</Text>
                    </View>
                    <View style={styles.foodItemBottom}>
                      {/* Live macro readout */}
                      <View style={styles.foodMacroPills}>
                        <Text style={styles.foodMacroPill}>{cals} kcal</Text>
                        <Text style={[styles.foodMacroPill, { color: Colors.protein }]}>P {prot}g</Text>
                        <Text style={[styles.foodMacroPill, { color: Colors.carbs }]}>C {carbs}g</Text>
                        <Text style={[styles.foodMacroPill, { color: Colors.fat }]}>F {fat}g</Text>
                      </View>
                      {/* Quantity stepper */}
                      <View style={styles.stepper}>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustAmount(i, -25)}>
                          <Ionicons name="remove" size={16} color={theme.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={styles.stepperInput}
                          keyboardType="numeric"
                          value={String(qty)}
                          onChangeText={val => {
                            const n = parseInt(val, 10);
                            if (!isNaN(n) && n > 0) setFoodAmounts(prev => ({ ...prev, [i]: n }));
                          }}
                          selectTextOnFocus
                        />
                        <Text style={styles.stepperUnit}>g</Text>
                        <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustAmount(i, 25)}>
                          <Ionicons name="add" size={16} color={theme.text} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Log button */}
            <View style={styles.logBtnWrap}>
              <DuoButton
                title={`Log ${MEAL_TYPES.find(m => m.id === selectedMealType)?.label ?? 'Meal'}`}
                onPress={logMeal}
                loading={isLogging}
                color={theme.primary}
                style={{ width: '100%' }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme: typeof Colors) {
  const AIMING_SIZE = width * 0.72;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    camera: {
      flex: 1,
      width: '100%',
    },

    // ── Header ───────────────────────────────────────────────────────────────
    header: {
      position: 'absolute',
      top: Platform.OS === 'android' ? 48 : 20,
      left: 20,
      right: 20,
      zIndex: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    closeButton: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      borderBottomWidth: 4,
      borderBottomColor: 'rgba(0,0,0,0.35)',
    },
    lidarBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      borderBottomWidth: 4,
      borderBottomColor: 'rgba(0,0,0,0.35)',
    },
    lidarBadgeActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
      borderBottomColor: 'rgba(0,0,0,0.2)',
    },
    lidarText: {
      fontSize: 13,
      fontWeight: '900',
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    lidarTextActive: { color: theme.white },

    // ── Instruction card ──────────────────────────────────────────────────────
    instructionRow: {
      position: 'absolute',
      top: Platform.OS === 'android' ? 116 : 88,
      left: 20,
      right: 20,
      zIndex: 10,
    },
    instructionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: 'rgba(10,10,10,0.92)',
      padding: 16,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.12)',
      borderBottomWidth: 5,
      borderBottomColor: 'rgba(0,0,0,0.3)',
    },
    instructionIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
      borderBottomWidth: 3,
      borderBottomColor: 'rgba(0,0,0,0.2)',
    },
    instructionText: {
      flex: 1,
      fontSize: 14,
      color: theme.white,
      lineHeight: 20,
      fontWeight: '700',
    },

    // ── Aiming overlay ────────────────────────────────────────────────────────
    aimingOverlay: {
      position: 'absolute',
      width: AIMING_SIZE,
      height: AIMING_SIZE,
      top: height / 2 - AIMING_SIZE / 2,
      left: (width - AIMING_SIZE) / 2,
      zIndex: 10,
    },
    aimingCorner: {
      position: 'absolute',
      width: 52,
      height: 52,
      borderColor: 'rgba(255,255,255,0.9)',
      borderWidth: 4,
      top: 0,
      left: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderRadius: 16,
    },
    aimingCornerTR: { left: undefined, right: 0, borderLeftWidth: 0, borderRightWidth: 4 },
    aimingCornerBL: { top: undefined, bottom: 0, borderTopWidth: 0, borderBottomWidth: 4 },
    aimingCornerBR: {
      top: undefined, bottom: 0, left: undefined, right: 0,
      borderLeftWidth: 0, borderRightWidth: 4,
      borderTopWidth: 0, borderBottomWidth: 4,
    },

    // ── Processing overlay ────────────────────────────────────────────────────
    processingOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 30,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    processingCard: {
      backgroundColor: 'rgba(10,10,10,0.92)',
      borderRadius: 24,
      paddingVertical: 28,
      paddingHorizontal: 36,
      alignItems: 'center',
      gap: 16,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.12)',
      borderBottomWidth: 5,
      borderBottomColor: 'rgba(0,0,0,0.3)',
    },
    processingText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.white,
      letterSpacing: 0.2,
    },

    // ── Error banner ──────────────────────────────────────────────────────────
    errorBanner: {
      position: 'absolute',
      bottom: 160,
      left: 20,
      right: 20,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: 'rgba(211,47,47,0.92)',
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    errorBannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: '#fff',
      lineHeight: 18,
    },

    // ── Pro tip ───────────────────────────────────────────────────────────────
    proTipRow: {
      position: 'absolute',
      bottom: 160,
      left: 20,
      right: 20,
      zIndex: 10,
    },
    proTipCard: {
      backgroundColor: 'rgba(10,10,10,0.92)',
      padding: 18,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: Colors.warning + '55',
      borderBottomWidth: 6,
      borderBottomColor: 'rgba(0,0,0,0.3)',
    },
    proTipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
    },
    proTipTitle: {
      fontSize: 13,
      fontWeight: '900',
      color: Colors.warning,
      letterSpacing: 1.2,
    },
    proTipText: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      lineHeight: 19,
      fontWeight: '600',
    },

    // ── Controls ──────────────────────────────────────────────────────────────
    controls: {
      position: 'absolute',
      bottom: Platform.OS === 'android' ? 48 : 40,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    controlButton: {
      width: 64,
      height: 64,
      borderRadius: 18,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.18)',
      borderBottomWidth: 5,
      borderBottomColor: 'rgba(0,0,0,0.35)',
    },
    controlButtonDummy: { width: 64 },
    captureButton: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.white,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: theme.border,
      borderBottomWidth: 12,
    },
    captureButtonDisabled: { opacity: 0.6 },
    captureButtonInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: theme.primary,
      borderBottomWidth: 6,
      borderBottomColor: 'rgba(0,0,0,0.2)',
    },

    // ── Permission screen ─────────────────────────────────────────────────────
    permissionText: {
      fontSize: 18,
      color: theme.white,
      marginTop: 20,
      marginBottom: 24,
      fontWeight: '900',
      textAlign: 'center',
      textTransform: 'uppercase',
    },

    // ── Log sheet ─────────────────────────────────────────────────────────────
    sheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    logSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.white,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: height * 0.72,
      paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    },
    logSheetHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 6,
    },
    logSheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },
    logSheetTitleWrap: { gap: 4 },
    logSheetTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
    },
    totalCalsBadge: {
      backgroundColor: theme.backgroundSecondary,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 20,
      alignSelf: 'flex-start',
    },
    totalCalsText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    logSheetCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Meal type selector
    mealTypeScroll: { flexGrow: 0, marginBottom: 12 },
    mealTypeScrollContent: { paddingHorizontal: 20, gap: 8 },
    mealTypeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
      backgroundColor: theme.white,
    },
    mealTypeChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primaryDark,
      borderBottomColor: theme.primaryDark,
    },
    mealTypeLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.textSecondary,
    },
    mealTypeLabelActive: { color: theme.white },

    // Food cards
    foodList: { paddingHorizontal: 20 },
    foodItem: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
      backgroundColor: theme.backgroundSecondary,
      padding: 12,
      marginBottom: 8,
      gap: 10,
    },
    foodItemTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    foodItemDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.primary,
      flexShrink: 0,
    },
    foodItemName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
    },
    foodItemBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    foodMacroPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      flex: 1,
    },
    foodMacroPill: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
    },

    // Stepper
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.white,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.border,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    stepperBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperInput: {
      minWidth: 36,
      fontSize: 14,
      fontWeight: '800',
      color: theme.text,
      textAlign: 'center',
      paddingHorizontal: 2,
    },
    stepperUnit: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '600',
      marginRight: 2,
    },

    // Log button
    logBtnWrap: {
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
    },
  });
}
