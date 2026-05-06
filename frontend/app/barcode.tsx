import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Dimensions,
  Modal,
  ActivityIndicator,
  Image,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from 'react-native';
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';
import { FoodHealthCheckResult, foodApi, mealApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';

const { width, height } = Dimensions.get('window');
const CONTRIBUTION_CARD_HEIGHT = Math.min(Math.round(height * 0.78), 840);

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BarcodeScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const params = useLocalSearchParams();
  const mode = typeof params?.mode === 'string' ? params.mode : '';
  const isHealthMode = mode === 'health';
  const { user } = useUser();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

  const [isSubmittingLabels, setIsSubmittingLabels] = useState(false);
  const [isProcessingLabel, setIsProcessingLabel] = useState(false);

  // Contribution modal state
  const [showContributionModal, setShowContributionModal] = useState(false);
  const [contributionBarcode, setContributionBarcode] = useState('');
  const [contributionNeedsFront, setContributionNeedsFront] = useState(false);
  const [contributionFrontImageBase64, setContributionFrontImageBase64] = useState<string | null>(null);
  const [contributionLabelImagesBase64, setContributionLabelImagesBase64] = useState<string[]>([]);
  const [contributionStep, setContributionStep] = useState<1 | 2>(1);

  const isProcessingRef = useRef(false);

  const resetScanning = () => {
    setShowResultModal(false);
    setShowContributionModal(false);
    setContributionBarcode('');
    setContributionNeedsFront(false);
    setContributionFrontImageBase64(null);
    setContributionLabelImagesBase64([]);
    setContributionStep(1);
    // Add a small delay to prevent immediate re-scan if still holding phone over barcode
    setTimeout(() => {
      isProcessingRef.current = false;
    }, 1000);
  };

  const _ensureCameraPermission = async (): Promise<boolean> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Camera permission is needed to take label photos.');
      return false;
    }
    return true;
  };

  const _captureBase64Photo = async (): Promise<string | null> => {
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.55,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return null;
    return result.assets[0].base64;
  };

  const addFrontPhoto = async () => {
    if (isSubmittingLabels || isProcessingLabel) return;
    if (!(await _ensureCameraPermission())) return;
    try {
      setIsSubmittingLabels(true);
      const b64 = await _captureBase64Photo();
      if (!b64) return;
      setContributionFrontImageBase64(b64);
    } finally {
      setIsSubmittingLabels(false);
    }
  };

  const captureOrReplaceLabelPhotoAt = async (idx: number) => {
    if (isSubmittingLabels || isProcessingLabel) return;
    if (idx < 0 || idx > 2) return;
    if (!(await _ensureCameraPermission())) return;
    try {
      setIsSubmittingLabels(true);
      const b64 = await _captureBase64Photo();
      if (!b64) return;
      setContributionLabelImagesBase64((prev) => {
        const next = [...prev];
        if (idx < next.length) next[idx] = b64;
        else next.push(b64);
        return next.slice(0, 3);
      });
    } finally {
      setIsSubmittingLabels(false);
    }
  };

  const removeLabelPhotoAt = (idx: number) => {
    setContributionLabelImagesBase64((prev) => prev.filter((_, i) => i !== idx));
  };

  const analyzeLabelPhotos = async (barcode: string) => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in.');
      return;
    }
    if (isSubmittingLabels || isProcessingLabel) return;
    if (!barcode) return;

    if (contributionNeedsFront && !contributionFrontImageBase64) {
      Alert.alert('Missing Front Photo', 'Please take a photo of the front of the pack first.');
      return;
    }

    if (!contributionLabelImagesBase64.length) {
      Alert.alert('Missing Label Photo', 'Please add at least 1 label photo (nutrition/ingredients).');
      return;
    }

    try {
      // Send to AI for processing
      setIsProcessingLabel(true);
      const response = await foodApi.processLabelImage(
        barcode,
        user.id,
        contributionLabelImagesBase64,
        contributionFrontImageBase64 ?? undefined
      );
      setIsProcessingLabel(false);

      // Close contribution modal
      setShowContributionModal(false);
      setContributionFrontImageBase64(null);
      setContributionLabelImagesBase64([]);
      setContributionStep(1);

      // Set the scanned product from AI response
      const food = response.food;
      const product = {
        name: food?.name || `Barcode ${barcode}`,
        brand: food?.brand || '',
        serving_size: 100,
        calories_per_100g: Number(food?.calories_per_100g || 0),
        protein_per_100g: Number(food?.protein_per_100g || 0),
        carbs_per_100g: Number(food?.carbs_per_100g || 0),
        fat_per_100g: Number(food?.fat_per_100g || 0),
        fiber_g_per_100g: Number(food?.fiber_g_per_100g || 0),
        sugar_g_per_100g: Number(food?.sugar_g_per_100g || 0),
        sodium_mg_per_100g: Number(food?.sodium_mg_per_100g || 0),
        ingredients: food?.ingredients || '',
        image_url: food?.image_url || '',
        calories: Math.round(Number(food?.calories_per_100g || 0)),
        protein: Number(food?.protein_per_100g || 0),
        carbs: Number(food?.carbs_per_100g || 0),
        fat: Number(food?.fat_per_100g || 0),
        category: food?.category || 'packaged',
        barcode: barcode,
        food_id: food?.id,
        cached: false,
      };

      setScannedProduct(product);

      // Set health check if returned
      if (response.health_check) {
        setHealthCheck(response.health_check);
      }

      // Show result modal
      setShowResultModal(true);
      setPortionQty('100');
      setPortionUnit('g');
      setMealType('snack');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      console.error('Label processing failed:', e);
      setIsProcessingLabel(false);
      const message = e?.response?.data?.detail || 'Could not process the label. Please try again.';
      Alert.alert('Processing Failed', message, [
        { text: 'Try Again', onPress: () => analyzeLabelPhotos(barcode) },
        { text: 'Scan Again', style: 'cancel', onPress: resetScanning },
      ]);
    } finally {
      setIsProcessingLabel(false);
    }
  };

  const [healthCheck, setHealthCheck] = useState<FoodHealthCheckResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [portionQty, setPortionQty] = useState('100');
  const [portionUnit, setPortionUnit] = useState<'g' | 'oz'>('g');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack');
  const [isLoggingMeal, setIsLoggingMeal] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const qtyInputRef = useRef<TextInput>(null);

  const gramsFromInput = useMemo(() => {
    const qty = Number((portionQty || '').toString().replace(',', '.')) || 0;
    return portionUnit === 'oz' ? qty * 28.3495 : qty;
  }, [portionQty, portionUnit]);

  const computedMacros = useMemo(() => {
    const grams = gramsFromInput;
    const ratio = grams / 100;
    const cals100 = Number(scannedProduct?.calories_per_100g || 0);
    const p100 = Number(scannedProduct?.protein_per_100g || 0);
    const cb100 = Number(scannedProduct?.carbs_per_100g || 0);
    const f100 = Number(scannedProduct?.fat_per_100g || 0);
    return {
      grams: Math.round(grams),
      calories: Math.round(cals100 * ratio),
      protein: Math.round(p100 * ratio),
      carbs: Math.round(cb100 * ratio),
      fat: Math.round(f100 * ratio),
    };
  }, [gramsFromInput, scannedProduct]);

  const parsePortionFromTranscript = (t: string): { qty?: string; unit?: 'g' | 'oz' } => {
    const text = (t || '').toLowerCase();
    const m = text.match(/(\d+(?:[\.,]\d+)?)(?:\s*)(g|gram|grams|oz|ounce|ounces)\b/);
    if (!m) return {};
    const qty = m[1].replace(',', '.');
    const u = m[2];
    const unit: 'g' | 'oz' = u.startsWith('o') ? 'oz' : 'g';
    return { qty, unit };
  };

  const startVoice = async () => {
    if (voiceLoading || isRecording) return;
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to use voice');
      return;
    }
    try {
      setVoiceLoading(true);
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    } catch (e) {
      console.error('Failed to start recording:', e);
      Alert.alert('Error', 'Failed to start recording');
      setRecording(null);
      setIsRecording(false);
    } finally {
      setVoiceLoading(false);
    }
  };

  const stopVoiceAndFill = async () => {
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

      const res = await mealApi.inferPortionFromAudio(uri, user.id);
      const transcript = res?.transcript || '';
      setVoiceTranscript(transcript);

      const aiQty = typeof res?.quantity === 'number' ? res.quantity : null;
      const aiUnit = res?.unit === 'g' || res?.unit === 'oz' ? res.unit : null;

      if (aiQty && aiQty > 0) {
        setPortionQty(String(aiQty));
        if (aiUnit) setPortionUnit(aiUnit);
      } else {
        const parsed = parsePortionFromTranscript(transcript);
        if (parsed.qty) setPortionQty(parsed.qty);
        if (parsed.unit) setPortionUnit(parsed.unit);
      }
      setTimeout(() => qtyInputRef.current?.focus(), 200);
    } catch (e) {
      console.error('Transcribe failed:', e);
      Alert.alert('Error', 'Failed to transcribe. Try again.');
    } finally {
      setVoiceLoading(false);
    }
  };

  const logMealFromBarcode = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in');
      return;
    }
    if (!scannedProduct) return;
    if (!computedMacros.grams || computedMacros.grams <= 0) {
      Alert.alert('Invalid portion', 'Enter a valid quantity in grams or ounces.');
      return;
    }

    const parsedQty = Number((portionQty || '').toString().replace(',', '.'));
    const displayQty = Number.isFinite(parsedQty) ? parsedQty : undefined;

    try {
      setIsLoggingMeal(true);
      await mealApi.logMeal({
        user_id: user.id,
        meal_type: mealType,
        logging_method: 'barcode',
        notes: `Barcode ${scannedProduct.barcode}`,
        foods: [
          {
            name: scannedProduct.name,
            quantity: computedMacros.grams,
            displayQuantity: displayQty,
            displayUnit: portionUnit,
            calories: computedMacros.calories,
            protein: computedMacros.protein,
            carbs: computedMacros.carbs,
            fat: computedMacros.fat,
            food_id: scannedProduct.food_id,
          },
        ],
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
      setShowResultModal(false);
      router.back();
    } catch (e) {
      console.error('Barcode log failed:', e);
      Alert.alert('Error', 'Failed to log meal');
    } finally {
      setIsLoggingMeal(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = async ({ type, data }: BarcodeScanningResult) => {
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    setModalStep(1);
    setIsLookingUp(true);
    if (isHealthMode) setHealthLoading(true);

    try {
      // Pass includeHealthCheck=true for health mode to get health check in single request
      const res = await foodApi.getByBarcode(data, isHealthMode);
      const f: any = res?.food;

      // Check if barcode exists but data is incomplete
      if (res?.needs_contribution) {
        setIsLookingUp(false);
        setHealthLoading(false);
        setContributionBarcode(data);
        setContributionNeedsFront(false);
        setShowContributionModal(true);
        setContributionStep(1);
        return;
      }

      const product = {
        name: f?.name || `Barcode ${data}`,
        brand: f?.brand || '',
        serving_size: 100,
        calories_per_100g: Number(f?.calories_per_100g || 0),
        protein_per_100g: Number(f?.protein_per_100g || 0),
        carbs_per_100g: Number(f?.carbs_per_100g || 0),
        fat_per_100g: Number(f?.fat_per_100g || 0),
        fiber_g_per_100g: Number(f?.fiber_g_per_100g || 0),
        sugar_g_per_100g: Number(f?.sugar_g_per_100g || 0),
        sodium_mg_per_100g: Number(f?.sodium_mg_per_100g || 0),
        ingredients: f?.ingredients || '',
        image_url: f?.image_url || '',
        calories: Math.round(Number(f?.calories_per_100g || 0)),
        protein: Number(f?.protein_per_100g || 0),
        carbs: Number(f?.carbs_per_100g || 0),
        fat: Number(f?.fat_per_100g || 0),
        category: f?.category || 'packaged',
        barcode: data,
        food_id: f?.id,
        cached: !!res?.cached,
      };

      setScannedProduct(product);

      // Health check is now included in the barcode lookup response
      if (isHealthMode && res?.health_check) {
        setHealthCheck(res.health_check);
      } else {
        setHealthCheck(null);
      }
      setHealthLoading(false);

      setShowResultModal(true);
      setPortionQty('100');
      setPortionUnit('g');
      setMealType('snack');
      setIsRecording(false);
      setRecording(null);
      setTimeout(() => qtyInputRef.current?.focus(), 250);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        // Show contribution modal for not found products
        setContributionBarcode(data);
        setContributionNeedsFront(true);
        setShowContributionModal(true);
        setContributionStep(1);
      } else {
        Alert.alert(
          'Lookup Failed',
          'Could not fetch product details. Please try again.',
          [
            { text: 'Try Again', onPress: resetScanning },
            { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
          ]
        );
      }
    } finally {
      setIsLookingUp(false);
    }
  };



  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color={Colors.error} />
        <Text style={styles.text}>No access to camera</Text>
        <DuoButton
          title="Go Back"
          onPress={() => router.back()}
          color={theme.primary}
          size="medium"
        />
      </View>
    );
  }

  const shouldShowCamera = !(showResultModal || showContributionModal || isProcessingLabel);

  return (
    <SafeAreaView style={styles.container}>
      <Modal
        visible={isProcessingLabel}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.processingTitle}>Parsing label…</Text>
            <Text style={styles.processingSubtitle}>This can take up to a minute</Text>
          </View>
        </View>
      </Modal>

      {shouldShowCamera ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
          }}
          onBarcodeScanned={handleBarCodeScanned}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                router.back();
              }}
            >
              <Ionicons name="close" size={28} color={theme.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.overlay}>
            <View style={styles.scanningFrame}>
              <View style={styles.corner} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <View style={styles.scanLine} />
            </View>

            <AnimatedCard type="pop" delay={200} style={styles.instructionBox}>
              <Ionicons name="barcode-outline" size={32} color={theme.white} />
              <Text style={styles.instructionTitle}>{isLookingUp ? 'Looking Up…' : 'Scan Barcode'}</Text>
              <Text style={styles.instructionText}>
                {isLookingUp ? 'Fetching product details' : 'Align the barcode within the frame'}
              </Text>
              {isLookingUp && <ActivityIndicator color={theme.white} style={{ marginTop: 10 }} />}
              <View style={styles.tipBadge}>
                <Text style={styles.tipText}>💡 TIP: HOLD STEADY</Text>
              </View>
            </AnimatedCard>
          </View>
        </CameraView>
      ) : (
        <View style={styles.cameraOffPlaceholder}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                router.back();
              }}
            >
              <Ionicons name="close" size={28} color={theme.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        transparent={true}
        animationType="slide"
        onRequestClose={resetScanning}
      >
        <View style={styles.modalOverlay}>
          <AnimatedCard type="pop" style={styles.resultCard}>
            {/* Close button outside ScrollView to stay fixed */}
            <TouchableOpacity
              style={styles.resultCloseButton}
              onPress={resetScanning}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color={theme.text} />
            </TouchableOpacity>

            <ScrollView
              style={styles.resultScroll}
              contentContainerStyle={styles.resultScrollContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.successIconWrap}>
                <Ionicons
                  name={isHealthMode ? 'shield-checkmark' : 'checkmark-circle'}
                  size={60}
                  color={isHealthMode ? Colors.warning : theme.primary}
                />
              </View>

              <Text style={styles.productName}>
                {scannedProduct?.name}
              </Text>
              <Text style={styles.productBrand}>
                {scannedProduct?.brand}
              </Text>

              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedProduct?.calories}</Text>
                  <Text style={styles.nutritionLabel}>CALORIES</Text>
                </View>
                <View style={styles.nutritionDivider} />
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedProduct?.protein}g</Text>
                  <Text style={styles.nutritionLabel}>PROTEIN</Text>
                </View>
                <View style={styles.nutritionDivider} />
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{scannedProduct?.carbs}g</Text>
                  <Text style={styles.nutritionLabel}>CARBS</Text>
                </View>
              </View>

              {isHealthMode ? (
                <>
                  {healthLoading ? (
                    <View style={styles.healthLoadingBox}>
                      <ActivityIndicator color={theme.primary} />
                      <Text style={styles.healthLoadingText}>Analyzing label…</Text>
                    </View>
                  ) : healthCheck ? (
                    <View style={styles.healthBox}>
                      <View style={styles.verdictRow}>
                        <Text style={styles.verdictLabel}>Verdict</Text>
                        <Text
                          style={[
                            styles.verdictValue,
                            healthCheck.verdict === 'good'
                              ? styles.verdictGood
                              : healthCheck.verdict === 'avoid'
                                ? styles.verdictAvoid
                                : styles.verdictCaution,
                          ]}
                        >
                          {healthCheck.verdict.toUpperCase()}
                        </Text>
                      </View>

                      {!!healthCheck.verdict_reason && (
                        <Text style={styles.verdictReason}>{healthCheck.verdict_reason}</Text>
                      )}

                      {!!healthCheck.summary && (
                        <Text style={styles.healthSummary}>{healthCheck.summary}</Text>
                      )}

                      {healthCheck.red_flags?.length ? (
                        <View style={styles.flagsBox}>
                          <Text style={styles.flagsTitle}>Red Flags</Text>
                          {healthCheck.red_flags.slice(0, 6).map((f, idx) => (
                            <View key={idx} style={styles.flagRow}>
                              <View
                                style={[
                                  styles.flagDot,
                                  f.severity === 'high'
                                    ? styles.flagDotHigh
                                    : f.severity === 'low'
                                      ? styles.flagDotLow
                                      : styles.flagDotMedium,
                                ]}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.flagTitle}>{f.title}</Text>
                                <Text style={styles.flagReason}>{f.reason}</Text>

                                {!!f.what_it_is && (
                                  <Text style={styles.flagDetail}><Text style={styles.flagDetailLabel}>What it is: </Text>{f.what_it_is}</Text>
                                )}
                                {!!f.why_it_matters && (
                                  <Text style={styles.flagDetail}><Text style={styles.flagDetailLabel}>Why it matters: </Text>{f.why_it_matters}</Text>
                                )}
                                {!!f.evidence && (
                                  <Text style={styles.flagDetail}><Text style={styles.flagDetailLabel}>Evidence: </Text>{f.evidence}</Text>
                                )}
                                {!!f.suggestion && (
                                  <Text style={styles.flagDetail}><Text style={styles.flagDetailLabel}>Try instead: </Text>{f.suggestion}</Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <Text style={styles.disclaimerText}>
                        Not medical advice. Always read the label and consider your needs.
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.nextStepText}>No analysis available.</Text>
                  )}

                </>
              ) : modalStep === 1 ? (
                <>
                  <Text style={styles.nextStepText}>
                    Product identified! Ready to set your portion?
                  </Text>

                  <View style={styles.modalButtons}>
                    <DuoButton
                      title="Next"
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setModalStep(2);
                      }}
                      color={theme.primary}
                      size="large"
                      style={{ width: '100%' }}
                    />
                    <TouchableOpacity
                      style={styles.cancelLink}
                      onPress={resetScanning}
                    >
                      <Text style={styles.cancelLinkText}>SCAN AGAIN</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.modalButtons}>
                    <View style={styles.portionRow}>
                      <View style={styles.portionInputContainer}>
                        <TextInput
                          ref={qtyInputRef}
                          value={portionQty}
                          onChangeText={setPortionQty}
                          placeholder="100"
                          placeholderTextColor={theme.textLight}
                          keyboardType="numeric"
                          style={styles.portionInput}
                        />
                        <TouchableOpacity
                          style={[styles.voiceMicButton, isRecording && styles.voiceMicButtonActive]}
                          onPress={() => {
                            if (isRecording) stopVoiceAndFill();
                            else startVoice();
                          }}
                          disabled={voiceLoading}
                        >
                          {voiceLoading ? (
                            <ActivityIndicator size="small" color={theme.primary} />
                          ) : (
                            <Ionicons
                              name={isRecording ? 'stop-circle' : 'mic'}
                              size={22}
                              color={isRecording ? Colors.error : theme.primary}
                            />
                          )}
                        </TouchableOpacity>
                      </View>
                      <View style={styles.unitToggle}>
                        <TouchableOpacity
                          style={[styles.unitOption, portionUnit === 'g' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => { });
                            setPortionUnit('g');
                          }}
                        >
                          <Text style={[styles.unitText, portionUnit === 'g' && styles.unitTextActive]}>g</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.unitOption, portionUnit === 'oz' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => { });
                            setPortionUnit('oz');
                          }}
                        >
                          <Text style={[styles.unitText, portionUnit === 'oz' && styles.unitTextActive]}>oz</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <DuoButton
                      title="Log Meal"
                      onPress={logMealFromBarcode}
                      disabled={isLoggingMeal}
                      loading={isLoggingMeal}
                      color={theme.primary}
                      size="large"
                      style={{ width: '100%' }}
                    />

                    <TouchableOpacity
                      style={styles.cancelLink}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setModalStep(1);
                      }}
                    >
                      <Text style={styles.cancelLinkText}>BACK</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </ScrollView>

            {isHealthMode ? (
              <View style={styles.modalButtons}>
                <DuoButton
                  title="Scan Again"
                  onPress={resetScanning}
                  color={theme.primary}
                  size="large"
                  style={{ width: '100%' }}
                />
              </View>
            ) : null}
          </AnimatedCard>
        </View>
      </Modal>

      {/* Label Photo Modal - for missing or incomplete data */}
      <Modal
        visible={showContributionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={resetScanning}
      >
        <View style={styles.modalOverlay}>
          <AnimatedCard type="pop" style={styles.contributionCard}>
            <TouchableOpacity
              style={styles.resultCloseButton}
              onPress={resetScanning}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={22} color={theme.text} />
            </TouchableOpacity>

            <ScrollView
              style={{ width: '100%' }}
              contentContainerStyle={[styles.contributionContent, { flexGrow: 1 }]}
              showsVerticalScrollIndicator={false}
              bounces={true}
            >
              <View style={{ flex: 1 }}>
                {contributionStep === 1 ? (
                  <>

                    <Text style={styles.contributionTitle}>
                      Help Us Help Everyone
                    </Text>

                    <Text style={styles.contributionSubtitle}>
                      {contributionNeedsFront ? 'This product is not in our database yet' : 'We need label details to add this product'}
                    </Text>

                    <Text style={styles.contributionText}>
                      By sharing a photo of the label, you help make the world a healthier place for everyone
                    </Text>

                    <View style={styles.contributionInstructions}>
                      <Text style={styles.contribInstructionTitle}>What to capture:</Text>
                      {contributionNeedsFront ? (
                        <View style={styles.contribInstructionRow}>
                          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                          <Text style={styles.contribInstructionText}>Front of the pack (product name)</Text>
                        </View>
                      ) : null}
                      <View style={styles.contribInstructionRow}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                        <Text style={styles.contribInstructionText}>Nutrition Facts label</Text>
                      </View>
                      <View style={styles.contribInstructionRow}>
                        <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                        <Text style={styles.contribInstructionText}>Ingredients list</Text>
                      </View>
                      <Text style={styles.contribInstructionHint}>
                        {contributionNeedsFront
                          ? 'We’ll ask for 2 photos: front of pack + the label (nutrition/ingredients).'
                          : 'Take the label (nutrition/ingredients). If both fit in one photo, that’s fine.'}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.photoRowWrap}>
                    </View>

                    {contributionNeedsFront ? (
                      <View style={styles.photoRowWrap}>
                        <Text style={styles.photoRowTitle}>Front photo</Text>
                        <View style={styles.photoRow}>
                          <TouchableOpacity
                            style={[styles.photoChip, !!contributionFrontImageBase64 && styles.photoChipActive]}
                            onPress={addFrontPhoto}
                            disabled={isSubmittingLabels || isProcessingLabel}
                          >
                            <Ionicons name="camera" size={16} color={theme.text} />
                            <Text style={styles.photoChipText}>{contributionFrontImageBase64 ? 'Retake' : 'Add'}</Text>
                          </TouchableOpacity>
                          <Text style={styles.photoCountText}>{contributionFrontImageBase64 ? '1/1 added' : '0/1 added'}</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.photoRowWrap}>
                      <View style={styles.photoRowHeader}>
                        <Text style={styles.photoRowTitle}>Label photos</Text>
                        <Text style={styles.photoCountText}>{contributionLabelImagesBase64.length}/3</Text>
                      </View>

                      <View style={styles.uploadGrid}>
                        {[0, 1, 2].map((idx) => {
                          const b64 = contributionLabelImagesBase64[idx];
                          const isFilled = !!b64;
                          return (
                            <View key={idx} style={styles.uploadSlotWrap}>
                              <TouchableOpacity
                                style={[styles.uploadSlot, isFilled && styles.uploadSlotFilled]}
                                onPress={() => captureOrReplaceLabelPhotoAt(idx)}
                                disabled={isSubmittingLabels || isProcessingLabel}
                                activeOpacity={0.9}
                              >
                                {isFilled ? (
                                  <Image
                                    source={{ uri: `data:image/jpeg;base64,${b64}` }}
                                    style={styles.uploadImage}
                                  />
                                ) : (
                                  <View style={styles.uploadEmptyState}>
                                    <Ionicons name="add" size={28} color={theme.textSecondary} />
                                    <Text style={styles.uploadEmptyText}>Add</Text>
                                  </View>
                                )}
                              </TouchableOpacity>

                              <View style={styles.uploadSlotFooter}>
                                <Text style={styles.uploadSlotLabel}>Photo {idx + 1}</Text>
                                {isFilled ? (
                                  <TouchableOpacity
                                    onPress={() => removeLabelPhotoAt(idx)}
                                    disabled={isSubmittingLabels || isProcessingLabel}
                                  >
                                    <Text style={styles.photoRemoveText}>Remove</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    <Text style={[styles.uploadTipText, { marginVertical: 16 }]}>
                      TIP: Use good lighting and keep text sharp. Add photos for nutrition + ingredients.
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.contributionButtons}>
                <DuoButton
                  title={contributionStep === 1 ? "Continue" : ((isSubmittingLabels || isProcessingLabel) ? 'Analyzing' : 'Analyze')}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    if (contributionStep === 1) {
                      setContributionStep(2);
                    } else {
                      analyzeLabelPhotos(contributionBarcode);
                    }
                  }}
                  disabled={isSubmittingLabels || isProcessingLabel}
                  loading={contributionStep === 2 && (isSubmittingLabels || isProcessingLabel)}
                  color={theme.primary}
                  size="large"
                  style={{ width: '100%' }}
                  leftIcon={<Ionicons name={contributionStep === 1 ? "arrow-forward" : "sparkles"} size={20} color={theme.white} />}
                />

                <TouchableOpacity
                  style={styles.cancelLink}
                  onPress={contributionStep === 1 ? resetScanning : () => setContributionStep(1)}
                  disabled={isSubmittingLabels || isProcessingLabel}
                >
                  <Text style={styles.cancelLinkText}>{contributionStep === 1 ? "SCAN AGAIN" : "BACK"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </AnimatedCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  processingCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.white,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  processingTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
  },
  processingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: theme.textLight,
    textAlign: 'center',
  },
  cameraOffPlaceholder: {
    flex: 1,
    width: '100%',
    backgroundColor: theme.black,
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 24,
    right: 24,
    zIndex: 10,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0, 0, 0, 0.4)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scanningFrame: {
    width: width * 0.7,
    aspectRatio: 1.2,
    position: 'relative',
    marginBottom: 40,
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: theme.primary,
    borderWidth: 4,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 16,
  },
  cornerTR: {
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  cornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  cornerBR: {
    top: undefined,
    bottom: 0,
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 10,
    right: 10,
    height: 3,
    backgroundColor: theme.primary,
    opacity: 0.9,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  instructionBox: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    padding: 24,
    borderRadius: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomWidth: 8,
    borderBottomColor: 'rgba(0, 0, 0, 0.3)',
    width: '100%',
  },
  instructionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.white,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  instructionText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: 8,
  },
  tipBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tipText: {
    fontSize: 12,
    color: theme.white,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 8, 8, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultCard: {
    backgroundColor: theme.white,
    borderRadius: 36,
    padding: 32,
    width: '100%',
    height: '80%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 12,
  },
  resultCloseButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    zIndex: 5,
  },
  resultScroll: {
    width: '100%',
    flex: 1,
  },
  resultScrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
    paddingTop: 10,
  },
  successIconWrap: {
    marginBottom: 24,
    backgroundColor: theme.primary + '15',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  productNameSmall: {
    fontSize: 18,
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.textSecondary,
    marginBottom: 28,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  productBrandSmall: {
    fontSize: 12,
    marginBottom: 16,
  },
  nutritionGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    width: '100%',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.text,
  },
  nutritionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: theme.textSecondary,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  healthLoadingBox: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    marginBottom: 20,
  },
  healthLoadingText: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
  },
  healthBox: {
    width: '100%',
    marginBottom: 18,
  },
  verdictRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  verdictLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  verdictValue: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  verdictReason: {
    width: '100%',
    fontSize: 13,
    fontWeight: '800',
    color: theme.text,
    lineHeight: 18,
    marginBottom: 8,
  },
  verdictGood: { color: Colors.success },
  verdictCaution: { color: Colors.warning },
  verdictAvoid: { color: Colors.error },
  healthSummary: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  flagsBox: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 16,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    marginBottom: 12,
  },
  flagsTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  flagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  flagDotHigh: { backgroundColor: Colors.error },
  flagDotMedium: { backgroundColor: Colors.warning },
  flagDotLow: { backgroundColor: Colors.success },
  flagTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 2,
  },
  flagReason: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 16,
  },
  flagDetail: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    lineHeight: 16,
    marginTop: 6,
  },
  flagDetailLabel: {
    fontWeight: '900',
    color: theme.text,
  },
  disclaimerText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    opacity: 0.8,
  },
  nutritionDivider: {
    width: 2,
    height: 34,
    backgroundColor: theme.border,
    borderRadius: 1,
    opacity: 0.6,
  },
  nextStepText: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    fontWeight: '800',
    lineHeight: 22,
    marginBottom: 28,
  },
  modalButtons: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  portionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    alignItems: 'center',
  },
  portionInputContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  portionInput: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingRight: 48,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
  },
  voiceMicButton: {
    position: 'absolute',
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  voiceMicButtonActive: {
    backgroundColor: Colors.error + '10',
    borderColor: Colors.error,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    alignItems: 'center',
  },
  unitOption: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  unitOptionActive: {
    backgroundColor: theme.white,
    borderWidth: 1,
    borderColor: theme.border,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  unitTextActive: {
    color: theme.primary,
  },
  heightSpacer: {
    height: 40,
  },
  transcriptBox: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 14,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text,
    lineHeight: 18,
  },
  cancelLink: {
    marginTop: 8,
    padding: 12,
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 16,
    color: theme.white,
    marginTop: 20,
    marginBottom: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Contribution Modal styles
  contributionCard: {
    backgroundColor: theme.white,
    borderRadius: 36,
    padding: 32,
    width: '100%',
    height: '90%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 12,
  },
  contributionContent: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
  },
  contributionIconWrap: {
    marginBottom: 24,
    backgroundColor: theme.primary + '15',
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributionTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contributionSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contributionText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  contributionInstructions: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  contribInstructionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  contribInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  contribInstructionText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  contribInstructionHint: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  contributionButtons: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  photoRowWrap: {
    width: '100%',
    marginBottom: 16,
  },
  photoRowTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  photoRowHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  photoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 2,
    borderColor: theme.border,
  },
  photoChipActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '10',
  },
  photoChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
    textAlign: 'right',
  },
  photoThumbList: {
    width: '100%',
    marginTop: 10,
    gap: 8,
  },
  photoThumb: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 2,
    borderColor: theme.border,
  },
  photoThumbText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.text,
  },
  photoRemoveText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  uploadGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  uploadSlotWrap: {
    width: '48%',
    marginBottom: 8,
  },
  uploadSlot: {
    width: '100%',
    aspectRatio: 0.85,
    borderRadius: 16,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 2,
    borderColor: theme.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadSlotFilled: {
    borderColor: theme.primary,
  },
  uploadImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  uploadEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadEmptyText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  uploadSlotFooter: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadSlotLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.text,
  },
  uploadTipText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  });
}
