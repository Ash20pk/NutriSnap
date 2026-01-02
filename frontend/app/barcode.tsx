import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { BarcodeScanningResult } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// Mock barcode database - in production, this would be an API call
const BARCODE_DATABASE: { [key: string]: any } = {
  '8901725111427': {
    name: 'Maggi 2-Minute Noodles',
    brand: 'Maggi',
    serving_size: 100,
    calories: 205,
    protein: 6,
    carbs: 30,
    fat: 7,
    category: 'Instant Food',
  },
  '8901063112391': {
    name: 'Britannia Good Day Butter Cookies',
    brand: 'Britannia',
    serving_size: 100,
    calories: 481,
    protein: 6.5,
    carbs: 67,
    fat: 21,
    category: 'Biscuits',
  },
  '8906010140014': {
    name: 'Mother Dairy Full Cream Milk',
    brand: 'Mother Dairy',
    serving_size: 100,
    calories: 62,
    protein: 3.2,
    carbs: 4.7,
    fat: 3.5,
    category: 'Dairy',
  },
  '8906010710014': {
    name: 'Amul Butter',
    brand: 'Amul',
    serving_size: 100,
    calories: 717,
    protein: 1.2,
    carbs: 0.2,
    fat: 81,
    category: 'Dairy',
  },
  // Add more barcodes as needed
};

export default function BarcodeScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (scanned) return;
    
    setScanned(true);

    // Look up product in database
    const product = BARCODE_DATABASE[data];

    if (product) {
      Alert.alert(
        `Product Found! 📦`,
        `${product.name}\n${product.brand}\n\nNutrition (per ${product.serving_size}g):\n` +
        `🔥 ${product.calories} calories\n` +
        `💪 ${product.protein}g protein\n` +
        `🍞 ${product.carbs}g carbs\n` +
        `🥑 ${product.fat}g fat\n\n` +
        `Now take a photo of how much you consumed!`,
        [
          {
            text: 'Take Photo',
            onPress: () => {
              router.push({
                pathname: '/camera',
                params: {
                  mode: 'barcode',
                  barcodeData: JSON.stringify(product),
                },
              });
            },
          },
          {
            text: 'Scan Again',
            style: 'cancel',
            onPress: () => setScanned(false),
          },
        ]
      );
    } else {
      Alert.alert(
        'Product Not Found',
        `Barcode: ${data}\n\nThis product is not in our database yet. Would you like to log it manually?`,
        [
          {
            text: 'Manual Entry',
            onPress: () => router.back(),
          },
          {
            text: 'Scan Again',
            style: 'cancel',
            onPress: () => setScanned(false),
          },
        ]
      );
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
        <Text style={styles.text}>No access to camera</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [
            'ean13',
            'ean8',
            'upc_a',
            'upc_e',
            'qr',
            'code128',
            'code39',
          ],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Scanning Frame */}
        <View style={styles.overlay}>
          <View style={styles.scanningFrame}>
            <View style={styles.corner} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            
            <View style={styles.scanLine} />
          </View>
          
          <View style={styles.instructionBox}>
            <Ionicons name="scan" size={32} color={Colors.white} />
            <Text style={styles.instructionTitle}>Scan Barcode</Text>
            <Text style={styles.instructionText}>
              Position the barcode within the frame
            </Text>
            <Text style={styles.tip}>
              💡 Works with packaged food items
            </Text>
          </View>
        </View>

        {/* Scanned Indicator */}
        {scanned && (
          <View style={styles.scannedOverlay}>
            <View style={styles.scannedBadge}>
              <Ionicons name="checkmark-circle" size={60} color={Colors.primary} />
              <Text style={styles.scannedText}>Scanned!</Text>
            </View>
          </View>
        )}
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  scanningFrame: {
    width: 280,
    height: 200,
    position: 'relative',
    marginBottom: 40,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: Colors.primary,
    borderWidth: 4,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
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
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.8,
  },
  instructionBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    gap: 8,
  },
  instructionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.white,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.white,
    textAlign: 'center',
    opacity: 0.9,
  },
  tip: {
    fontSize: 13,
    color: Colors.white,
    marginTop: 8,
    opacity: 0.8,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannedBadge: {
    backgroundColor: Colors.white,
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    gap: 12,
  },
  scannedText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  text: {
    fontSize: 16,
    color: Colors.white,
    marginBottom: 20,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
});