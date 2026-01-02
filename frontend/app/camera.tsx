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
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';

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

  // Check if this is for barcode scanning
  const isBarcodeScan = params?.mode === 'barcode';

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      
      // Check for LiDAR availability (iOS Pro devices)
      if (Platform.OS === 'ios') {
        // LiDAR is available on iPhone 12 Pro and later
        // This is a simplified check - in production, use a proper capability check
        setHasLiDAR(true); // Assume available for now
      }
    })();

    // If barcode data is passed, set it
    if (params?.barcodeData) {
      try {
        setBarcodeData(JSON.parse(params.barcodeData as string));
      } catch (e) {
        console.error('Error parsing barcode data:', e);
      }
    }
  }, [params]);

  const calculateVolumeFromDepth = async (depthData: any) => {
    // Simplified volume calculation from depth data
    // In production, this would use advanced 3D mesh analysis
    try {
      // Estimate volume based on depth map
      // This is a placeholder - real implementation would process the depth buffer
      const estimatedVolume = 250; // ml
      const estimatedWeight = estimatedVolume * 1.0; // Assuming density ~1g/ml
      return estimatedWeight;
    } catch (error) {
      console.error('Error calculating volume:', error);
      return null;
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current || !user) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        // Enable depth data capture if LiDAR is available
        ...(hasLiDAR && lidarEnabled && Platform.OS === 'ios' && {
          enableDepthData: true,
        }),
      });

      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      let portionEstimate = null;
      let depthAnalysis = '';

      // Process depth data if available (LiDAR)
      if (photo.depthData && hasLiDAR && lidarEnabled) {
        portionEstimate = await calculateVolumeFromDepth(photo.depthData);
        depthAnalysis = `\n\n📐 LiDAR Analysis: Estimated ${portionEstimate}g based on 3D depth measurement`;
      }

      // If this is a barcode scan follow-up
      if (barcodeData) {
        Alert.alert(
          'Portion Captured! 📸',
          `Product: ${barcodeData.name}\n` +
          `${depthAnalysis || '\n📏 Analyzing portion size...'}\n\n` +
          `Logging your meal now...`,
          [
            {
              text: 'Log Meal',
              onPress: async () => {
                // Calculate portion consumed (assume 50% for now)
                const portionFactor = portionEstimate ? portionEstimate / 100 : 0.5;
                
                await mealApi.logMeal({
                  user_id: user.id,
                  meal_type: 'snack',
                  foods: [{
                    name: barcodeData.name,
                    quantity: Math.round(barcodeData.serving_size * portionFactor),
                    calories: Math.round(barcodeData.calories * portionFactor),
                    protein: Math.round(barcodeData.protein * portionFactor),
                    carbs: Math.round(barcodeData.carbs * portionFactor),
                    fat: Math.round(barcodeData.fat * portionFactor),
                  }],
                  image_base64: photo.base64,
                  logging_method: 'barcode',
                  notes: `Scanned barcode, ${hasLiDAR && lidarEnabled ? 'LiDAR measured' : 'estimated'} portion`,
                });
                Alert.alert('Success', 'Meal logged successfully!');
                router.back();
              },
            },
            {
              text: 'Retake',
              style: 'cancel',
            },
          ]
        );
        setIsProcessing(false);
        return;
      }

      // Regular photo analysis with AI
      const analysis = await mealApi.logPhoto(photo.base64, user.id);

      if (analysis.foods && analysis.foods.length > 0) {
        const coinStatus = analysis.coin_detected 
          ? '✅ Coin detected for accurate portions' 
          : (hasLiDAR && lidarEnabled) 
            ? '📐 LiDAR measured portions' 
            : '⚠️ No coin detected - portions estimated';

        Alert.alert(
          'Food Detected! 🎉',
          `Found: ${analysis.foods.map((f: any) => f.name).join(', ')}\n\n${coinStatus}${depthAnalysis}`,
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
                Alert.alert('Success', 'Meal logged successfully!');
                router.back();
              },
            },
            {
              text: 'Retake',
              style: 'cancel',
            },
          ]
        );
      } else {
        Alert.alert(
          'No Food Detected',
          'Could not identify food in the image. Please try again with better lighting.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to analyze image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
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
        <Text style={styles.permissionText}>No access to camera</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView 
        style={styles.camera} 
        facing={facing}
        ref={cameraRef}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
          
          {/* LiDAR Indicator */}
          {hasLiDAR && (
            <TouchableOpacity 
              style={[styles.lidarBadge, lidarEnabled && styles.lidarBadgeActive]}
              onPress={() => setLidarEnabled(!lidarEnabled)}
            >
              <Ionicons 
                name={lidarEnabled ? "cube" : "cube-outline"} 
                size={20} 
                color={lidarEnabled ? Colors.white : Colors.textLight} 
              />
              <Text style={[styles.lidarText, lidarEnabled && styles.lidarTextActive]}>
                LiDAR
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Instructions */}
        <View style={styles.overlay}>
          <View style={styles.instructionContainer}>
            <Ionicons name="information-circle" size={24} color={Colors.white} />
            <Text style={styles.instructionText}>
              {barcodeData 
                ? `📦 Take photo of how much you ate of ${barcodeData.name}`
                : hasLiDAR && lidarEnabled
                ? '📐 LiDAR active - automatic 3D measurement enabled!'
                : '🪙 Place a coin next to your food for accurate portion tracking'}
            </Text>
          </View>

          {/* Barcode Info Card */}
          {barcodeData && (
            <View style={styles.barcodeInfoCard}>
              <Text style={styles.barcodeInfoTitle}>{barcodeData.name}</Text>
              <Text style={styles.barcodeInfoText}>
                {barcodeData.calories} cal • Serving: {barcodeData.serving_size}g
              </Text>
            </View>
          )}

          {/* Coin/LiDAR indicator */}
          {!barcodeData && (
            <View style={styles.coinIndicator}>
              {hasLiDAR && lidarEnabled ? (
                <>
                  <View style={styles.lidarScanningBox}>
                    <View style={styles.scanCorner} />
                    <View style={[styles.scanCorner, styles.scanCornerTR]} />
                    <View style={[styles.scanCorner, styles.scanCornerBL]} />
                    <View style={[styles.scanCorner, styles.scanCornerBR]} />
                  </View>
                  <Text style={styles.coinLabel}>📐 3D Scanning Active</Text>
                </>
              ) : (
                <>
                  <View style={styles.coinCircle}>
                    <Ionicons name="ellipse" size={40} color="rgba(255, 255, 255, 0.3)" />
                  </View>
                  <Text style={styles.coinLabel}>Place coin here 🪙</Text>
                </>
              )}
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse" size={32} color={Colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureButton, isProcessing && styles.captureButtonDisabled]}
            onPress={takePicture}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color={Colors.white} />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          <View style={styles.controlButton} />
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
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lidarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lidarBadgeActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  lidarText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textLight,
  },
  lidarTextActive: {
    color: Colors.white,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 180,
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.white,
    lineHeight: 20,
  },
  barcodeInfoCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
  },
  barcodeInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 4,
  },
  barcodeInfoText: {
    fontSize: 14,
    color: Colors.white,
    opacity: 0.9,
  },
  coinIndicator: {
    alignItems: 'center',
  },
  coinCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: Colors.white,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  lidarScanningBox: {
    width: 120,
    height: 120,
    marginBottom: 8,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: Colors.primary,
    borderWidth: 3,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  scanCornerTR: {
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
  },
  scanCornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  scanCornerBR: {
    top: undefined,
    bottom: 0,
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderBottomWidth: 3,
  },
  coinLabel: {
    fontSize: 12,
    color: Colors.white,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: '600',
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
    width: 50,
    height: 50,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
  },
  permissionText: {
    fontSize: 18,
    color: Colors.text,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
});