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
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';
import { foodApi, mealApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Audio } from 'expo-av';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function BarcodeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    if (scanned || showResultModal) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setScanned(true);
    setModalStep(1);

    setIsLookingUp(true);
    try {
      const res = await foodApi.getByBarcode(data);
      const f: any = res?.food;
      const product = {
        name: f?.name || `Barcode ${data}`,
        brand: f?.brand || '',
        serving_size: 100,
        calories_per_100g: Number(f?.calories_per_100g || 0),
        protein_per_100g: Number(f?.protein_per_100g || 0),
        carbs_per_100g: Number(f?.carbs_per_100g || 0),
        fat_per_100g: Number(f?.fat_per_100g || 0),
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
      setShowResultModal(true);
      setPortionQty('100');
      setPortionUnit('g');
      setMealType('snack');
      setVoiceTranscript('');
      setIsRecording(false);
      setRecording(null);
      setTimeout(() => qtyInputRef.current?.focus(), 250);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        Alert.alert(
          'Product Not Found',
          `Barcode: ${data}\n\nWe couldn't find this product yet. Try another barcode or log manually.`,
          [
            { text: 'Manual Entry', onPress: () => router.back() },
            { text: 'Scan Again', style: 'cancel', onPress: () => setScanned(false) },
          ]
        );
      } else {
        Alert.alert(
          'Lookup Failed',
          'Could not fetch product details. Please try again.',
          [{ text: 'Scan Again', onPress: () => setScanned(false) }]
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
          color={Colors.primary}
          size="medium"
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'],
        }}
        onBarcodeScanned={(scanned || showResultModal) ? undefined : handleBarCodeScanned}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.back();
            }}
          >
            <Ionicons name="close" size={28} color={Colors.white} />
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
            <Ionicons name="barcode-outline" size={32} color={Colors.white} />
            <Text style={styles.instructionTitle}>{isLookingUp ? 'Looking Up…' : 'Scan Barcode'}</Text>
            <Text style={styles.instructionText}>
              {isLookingUp ? 'Fetching product details' : 'Align the barcode within the frame'}
            </Text>
            {isLookingUp && <ActivityIndicator color={Colors.white} style={{ marginTop: 10 }} />}
            <View style={styles.tipBadge}>
              <Text style={styles.tipText}>💡 TIP: HOLD STEADY</Text>
            </View>
          </AnimatedCard>
        </View>

        {/* Result Modal */}
        <Modal
          visible={showResultModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowResultModal(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <AnimatedCard type="pop" style={styles.resultCard}>
                <View style={styles.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={60} color={Colors.primary} />
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

                {modalStep === 1 ? (
                  <>
                    <Text style={styles.nextStepText}>
                      Product identified! Ready to set your portion?
                    </Text>

                    <View style={styles.modalButtons}>
                      <DuoButton
                        title="Next"
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setModalStep(2);
                        }}
                        color={Colors.primary}
                        size="large"
                        style={{ width: '100%' }}
                      />
                      <TouchableOpacity 
                        style={styles.cancelLink}
                        onPress={() => {
                          setShowResultModal(false);
                          setScanned(false);
                        }}
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
                            placeholderTextColor={Colors.textLight}
                            keyboardType="numeric"
                            style={styles.portionInput}
                          />
                          <TouchableOpacity
                            style={[
                              styles.voiceMicButton,
                              isRecording && styles.voiceMicButtonActive
                            ]}
                            onPress={() => {
                              if (isRecording) stopVoiceAndFill();
                              else startVoice();
                            }}
                            disabled={voiceLoading}
                          >
                            {voiceLoading ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Ionicons 
                                name={isRecording ? "stop-circle" : "mic"} 
                                size={22} 
                                color={isRecording ? Colors.error : Colors.primary} 
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                        <View style={styles.unitToggle}>
                          <TouchableOpacity
                            style={[styles.unitOption, portionUnit === 'g' && styles.unitOptionActive]}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setPortionUnit('g');
                            }}
                          >
                            <Text style={[styles.unitText, portionUnit === 'g' && styles.unitTextActive]}>g</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.unitOption, portionUnit === 'oz' && styles.unitOptionActive]}
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setPortionUnit('oz');
                            }}
                          >
                            <Text style={[styles.unitText, portionUnit === 'oz' && styles.unitTextActive]}>oz</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <DuoButton
                        title={`Log Meal`}
                        onPress={logMealFromBarcode}
                        disabled={isLoggingMeal}
                        loading={isLoggingMeal}
                        color={Colors.primary}
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
              </AnimatedCard>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </CameraView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: Colors.primary,
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
    backgroundColor: Colors.primary,
    opacity: 0.9,
    shadowColor: Colors.primary,
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
    color: Colors.white,
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
    color: Colors.white,
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
    backgroundColor: Colors.white,
    borderRadius: 36,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 12,
  },
  successIconWrap: {
    marginBottom: 24,
    backgroundColor: Colors.primary + '15',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
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
    color: Colors.textSecondary,
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
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 28,
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  nutritionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: Colors.textSecondary,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nutritionDivider: {
    width: 2,
    height: 34,
    backgroundColor: Colors.border,
    borderRadius: 1,
    opacity: 0.6,
  },
  nextStepText: {
    fontSize: 15,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingRight: 48,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  voiceMicButton: {
    position: 'absolute',
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
    alignItems: 'center',
  },
  unitOption: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  unitOptionActive: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  unitTextActive: {
    color: Colors.primary,
  },
  heightSpacer: {
    height: 40,
  },
  transcriptBox: {
    width: '100%',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    padding: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  transcriptLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  transcriptText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 18,
  },
  cancelLink: {
    marginTop: 8,
    padding: 12,
  },
  cancelLinkText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 16,
    color: Colors.white,
    marginTop: 20,
    marginBottom: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
});
