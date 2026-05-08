import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Dimensions,
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

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');

      if (Platform.OS === 'ios') {
        try {
          const { useCameraDevice } = require('react-native-vision-camera');
          // Resolved at hook level below — we do a one-shot static check here
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

  const takePicture = async () => {
    if (!cameraRef.current || !user) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        ...(hasLiDAR && lidarEnabled && Platform.OS === 'ios' && {
          enableDepthData: true,
        }),
      });

      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      if (barcodeData) {
        Alert.alert(
          'Portion Captured! 📸',
          `Product: ${barcodeData.name}\n\nAnalyzing portion size...`,
          [
            {
              text: 'Log Meal',
              onPress: async () => {
                await mealApi.logMeal({
                  user_id: user.id,
                  meal_type: 'snack',
                  foods: [{
                    name: barcodeData.name,
                    quantity: Math.round(barcodeData.serving_size * 0.5),
                    calories: Math.round(barcodeData.calories * 0.5),
                    protein: Math.round(barcodeData.protein * 0.5),
                    carbs: Math.round(barcodeData.carbs * 0.5),
                    fat: Math.round(barcodeData.fat * 0.5),
                  }],
                  image_base64: photo.base64,
                  logging_method: 'barcode',
                  notes: `Scanned barcode, estimated portion`,
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                router.back();
              },
            },
            { text: 'Retake', style: 'cancel' },
          ]
        );
        return;
      }

      const presence = await mealApi.hasFood(photo.base64, user.id);
      if (presence && presence.has_food === false) {
        Alert.alert(
          'No Food Detected',
          'We could not detect food in the frame. Please adjust the camera and try again.',
          [{ text: 'OK' }]
        );
        return;
      }

      const analysis = await mealApi.logPhoto(photo.base64, user.id);

      if (analysis.foods && analysis.foods.length > 0) {
        Alert.alert(
          'Food Detected! 🎉',
          `Found: ${analysis.foods.map((f: any) => f.name).join(', ')}`,
          [
            {
              text: 'Log Meal',
              onPress: async () => {
                await mealApi.logMeal({
                  user_id: user.id,
                  meal_type: 'lunch',
                  foods: analysis.foods,
                  image_base64: photo.base64,
                  logging_method: 'photo',
                  notes: analysis.notes || '',
                });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                router.back();
              },
            },
            { text: 'Retake', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('No Food Detected', 'Could not identify food. Please try again with better lighting.');
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to analyze image. Please try again.');
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

  return (
    <SafeAreaView style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>

        {/* Header row */}
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
              <Text style={[styles.lidarText, lidarEnabled && styles.lidarTextActive]}>
                LiDAR
              </Text>
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

        {/* Pro tip card */}
        {!barcodeData && (
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

    // ── Header ──────────────────────────────────────────────────────────────
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
    lidarTextActive: {
      color: theme.white,
    },

    // ── Instruction card ────────────────────────────────────────────────────
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

    // ── Aiming overlay ──────────────────────────────────────────────────────
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
    aimingCornerTR: {
      left: undefined,
      right: 0,
      borderLeftWidth: 0,
      borderRightWidth: 4,
    },
    aimingCornerBL: {
      top: undefined,
      bottom: 0,
      borderTopWidth: 0,
      borderBottomWidth: 4,
    },
    aimingCornerBR: {
      top: undefined,
      bottom: 0,
      left: undefined,
      right: 0,
      borderLeftWidth: 0,
      borderRightWidth: 4,
      borderTopWidth: 0,
      borderBottomWidth: 4,
    },

    // ── Pro tip ─────────────────────────────────────────────────────────────
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

    // ── Controls ─────────────────────────────────────────────────────────────
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
    controlButtonDummy: {
      width: 64,
    },
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
    captureButtonDisabled: {
      opacity: 0.6,
    },
    captureButtonInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: theme.primary,
      borderBottomWidth: 6,
      borderBottomColor: 'rgba(0,0,0,0.2)',
    },

    // ── Permission screen ────────────────────────────────────────────────────
    permissionText: {
      fontSize: 18,
      color: theme.white,
      marginTop: 20,
      marginBottom: 24,
      fontWeight: '900',
      textAlign: 'center',
      textTransform: 'uppercase',
    },
  });
}
