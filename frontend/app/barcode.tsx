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
import { CameraView, Camera, BarcodeScanningResult } from 'expo-camera';
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
  productBrand: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
    marginBottom: 28,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
