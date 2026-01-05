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
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';

const { width } = Dimensions.get('window');

export default function CameraScreen() {
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
        setHasLiDAR(true);
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
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={64} color={Colors.error} />
        <Text style={styles.permissionText}>No access to camera</Text>
        <DuoButton title="Go Back" onPress={() => router.back()} color={Colors.primary} size="medium" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
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
          
          {hasLiDAR && (
            <TouchableOpacity 
              style={[styles.lidarBadge, lidarEnabled && styles.lidarBadgeActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setLidarEnabled(!lidarEnabled);
              }}
            >
              <Ionicons 
                name={lidarEnabled ? "cube" : "cube-outline"} 
                size={20} 
                color={lidarEnabled ? Colors.white : 'rgba(255,255,255,0.6)'} 
              />
              <Text style={[styles.lidarText, lidarEnabled && styles.lidarTextActive]}>
                LiDAR
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.overlay}>
          <AnimatedCard type="slide" delay={100} style={styles.instructionContainer}>
            <View style={styles.instructionIconWrap}>
              <Ionicons 
                name={barcodeData ? "basket-outline" : "camera-outline"} 
                size={24} 
                color={Colors.white} 
              />
            </View>
            <Text style={styles.instructionText}>
              {barcodeData 
                ? `Take a photo of your portion of ${barcodeData.name}`
                : 'Position your food clearly in the center of the frame'}
            </Text>
          </AnimatedCard>

          <View style={styles.aimingOverlay}>
            <View style={styles.aimingCorner} />
            <View style={[styles.aimingCorner, styles.aimingCornerTR]} />
            <View style={[styles.aimingCorner, styles.aimingCornerBL]} />
            <View style={[styles.aimingCorner, styles.aimingCornerBR]} />
            
            {!barcodeData && (
              <View style={styles.coinHint}>
                <View style={styles.coinCircle}>
                  <Text style={styles.coinEmoji}>🪙</Text>
                </View>
                <Text style={styles.coinText}>PLACE COIN FOR SCALE</Text>
              </View>
            )}
          </View>

          {!barcodeData && (
            <AnimatedCard type="pop" delay={300} style={styles.proTipCard}>
              <View style={styles.proTipHeader}>
                <Ionicons name="bulb" size={20} color={Colors.warning} />
                <Text style={styles.proTipTitle}>PRO TIP</Text>
              </View>
              <Text style={styles.proTipText}>
                Good lighting and a standard coin help our AI measure portions accurately!
              </Text>
            </AnimatedCard>
          )}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setFacing(current => (current === 'back' ? 'front' : 'back'));
            }}
          >
            <Ionicons name="camera-reverse-outline" size={28} color={Colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color={Colors.white} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  lidarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0, 0, 0, 0.4)',
  },
  lidarBadgeActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
  },
  lidarText: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lidarTextActive: {
    color: Colors.white,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 160,
    paddingHorizontal: 24,
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    padding: 18,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomWidth: 6,
    borderBottomColor: 'rgba(0, 0, 0, 0.3)',
  },
  instructionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: Colors.white,
    lineHeight: 22,
    fontWeight: '800',
  },
  aimingOverlay: {
    width: width * 0.75,
    aspectRatio: 1,
    alignSelf: 'center',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aimingCorner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: Colors.white,
    borderWidth: 4,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 16,
    opacity: 0.9,
  },
  aimingCornerTR: {
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
  },
  aimingCornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  aimingCornerBR: {
    top: undefined,
    bottom: 0,
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  coinHint: {
    alignItems: 'center',
    gap: 10,
  },
  coinCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coinEmoji: {
    fontSize: 24,
    opacity: 0.6,
  },
  coinText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    opacity: 0.7,
  },
  proTipCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    padding: 20,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.warning + '60',
    borderBottomWidth: 8,
    borderBottomColor: 'rgba(0, 0, 0, 0.3)',
  },
  proTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  proTipTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.warning,
    letterSpacing: 1.2,
  },
  proTipText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
    fontWeight: '700',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0, 0, 0, 0.4)',
  },
  controlButtonDummy: {
    width: 64,
  },
  captureButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: 12,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary,
    borderBottomWidth: 6,
    borderBottomColor: 'rgba(0, 0, 0, 0.2)',
  },
  permissionText: {
    fontSize: 18,
    color: Colors.white,
    marginTop: 20,
    marginBottom: 24,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
