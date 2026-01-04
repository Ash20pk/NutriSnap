import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Dimensions,
  Modal,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { BarcodeScanningResult } from 'expo-camera';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DuoButton from '../components/DuoButton';
import AnimatedCard from '../components/AnimatedCard';

const { width } = Dimensions.get('window');

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
};

export default function BarcodeScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (scanned || showResultModal) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setScanned(true);

    const product = BARCODE_DATABASE[data];
    if (product) {
      setScannedProduct(product);
      setShowResultModal(true);
    } else {
      Alert.alert(
        'Product Not Found',
        `Barcode: ${data}\n\nThis product is not in our database yet. Would you like to log it manually?`,
        [
          { text: 'Manual Entry', onPress: () => router.back() },
          { text: 'Scan Again', style: 'cancel', onPress: () => setScanned(false) },
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
            <Text style={styles.instructionTitle}>Scan Barcode</Text>
            <Text style={styles.instructionText}>
              Align the barcode within the frame
            </Text>
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
          <View style={styles.modalOverlay}>
            <AnimatedCard type="pop" style={styles.resultCard}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={60} color={Colors.primary} />
              </View>
              
              <Text style={styles.productName}>{scannedProduct?.name}</Text>
              <Text style={styles.productBrand}>{scannedProduct?.brand}</Text>
              
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

              <Text style={styles.nextStepText}>
                Now take a photo of your portion to calculate exact calories!
              </Text>

              <View style={styles.modalButtons}>
                <DuoButton
                  title="Take Photo"
                  onPress={() => {
                    setShowResultModal(false);
                    router.push({
                      pathname: '/camera',
                      params: {
                        mode: 'barcode',
                        barcodeData: JSON.stringify(scannedProduct),
                      },
                    });
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
            </AnimatedCard>
          </View>
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
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    width: 40,
    height: 40,
    borderColor: Colors.primary,
    borderWidth: 4,
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 4,
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
    height: 2,
    backgroundColor: Colors.primary,
    opacity: 0.8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  instructionBox: {
    backgroundColor: 'rgba(13, 8, 8, 0.85)',
    padding: 24,
    borderRadius: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
  },
  instructionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  instructionText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 8,
  },
  tipBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tipText: {
    fontSize: 11,
    color: Colors.white,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    borderRadius: 32,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 10,
  },
  successIconWrap: {
    marginBottom: 20,
  },
  productName: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  productBrand: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nutritionGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  nutritionItem: {
    flex: 1,
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  nutritionLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginTop: 4,
  },
  nutritionDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  nextStepText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    width: '100%',
    alignItems: 'center',
  },
  cancelLink: {
    marginTop: 20,
    padding: 10,
  },
  cancelLinkText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 1,
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
