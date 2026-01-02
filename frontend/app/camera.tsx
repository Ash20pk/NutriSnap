import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { useUser } from '../context/UserContext';
import { mealApi } from '../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';

export default function CameraScreen() {
  const router = useRouter();
  const { user } = useUser();
  const cameraRef = useRef<any>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const takePicture = async () => {
    if (!cameraRef.current || !user) return;

    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      if (!photo.base64) {
        throw new Error('Failed to capture image');
      }

      // Analyze the photo
      const analysis = await mealApi.logPhoto(photo.base64, user.id);

      if (analysis.foods && analysis.foods.length > 0) {
        // Show results and navigate to log screen with data
        Alert.alert(
          'Food Detected!',
          `Found: ${analysis.foods.map((f: any) => f.name).join(', ')}\n\n` +
          `${analysis.coin_detected ? '✅ Coin detected for accurate portions' : '⚠️ No coin detected - portions estimated'}`,
          [
            {
              text: 'Log Meal',
              onPress: async () => {
                await mealApi.logMeal({
                  user_id: user.id,
                  meal_type: 'lunch', // Default to lunch, can be changed
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
        </View>

        {/* Coin Calibration Overlay */}
        <View style={styles.overlay}>
          <View style={styles.instructionContainer}>
            <Ionicons name="information-circle" size={24} color={Colors.white} />
            <Text style={styles.instructionText}>
              Place a coin next to your food for accurate portion tracking
            </Text>
          </View>

          {/* Coin indicator circle */}
          <View style={styles.coinIndicator}>
            <View style={styles.coinCircle}>
              <Ionicons name="ellipse" size={40} color="rgba(255, 255, 255, 0.3)" />
            </View>
            <Text style={styles.coinLabel}>Place coin here</Text>
          </View>
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
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
  coinLabel: {
    fontSize: 12,
    color: Colors.white,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
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
