import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi, foodApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import PageHeader from '../../components/PageHeader';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';

import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import XpPopUp from '../../components/XpPopUp';

export default function LogScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [mealType, setMealType] = useState('breakfast');
  const [logMethod, setLogMethod] = useState<'photo' | 'manual' | 'voice' | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showXp, setShowXp] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);

  const mealTypes = [
    { id: 'breakfast', label: 'Breakfast', icon: 'sunny' },
    { id: 'lunch', label: 'Lunch', icon: 'restaurant' },
    { id: 'dinner', label: 'Dinner', icon: 'moon' },
    { id: 'snack', label: 'Snack', icon: 'fast-food' },
  ];

  // Animated values for cards
  const mealTypeAnims = useRef(mealTypes.map(() => new Animated.Value(0))).current;
  const methodAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  const handlePressIn = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  const handlePressOut = (anim: Animated.Value) => {
    Animated.spring(anim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  const getCardStyle = (anim: Animated.Value) => ({
    transform: [{
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 4],
      })
    }]
  });

  const handlePhotoLog = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }

      router.push('/camera');
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      Alert.alert('Error', 'Failed to access camera');
    }
  };

  const handleVoiceLog = () => {
    setLogMethod('voice');
    setShowModal(true);
  };

  const handleManualLog = () => {
    setLogMethod('manual');
    setShowModal(true);
  };

  const searchFoods = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await foodApi.searchFoods(query);
      setSearchResults(response.foods || []);
    } catch (error) {
      console.error('Error searching foods:', error);
    }
  };

  const addFood = (food: any) => {
    const quantity = food.serving_size || 100;
    const multiplier = quantity / 100;
    
    const newFood = {
      name: food.name,
      quantity,
      calories: Math.round(food.calories_per_100g * multiplier),
      protein: Math.round(food.protein_per_100g * multiplier),
      carbs: Math.round(food.carbs_per_100g * multiplier),
      fat: Math.round(food.fat_per_100g * multiplier),
    };
    
    setSelectedFoods([...selectedFoods, newFood]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const saveMeal = async () => {
    if (selectedFoods.length === 0) {
      Alert.alert('No Foods', 'Please add at least one food item');
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      await mealApi.logMeal({
        user_id: user.id,
        meal_type: mealType,
        foods: selectedFoods,
        logging_method: logMethod || 'manual',
      });

      // Calculate XP (mock logic: 10 XP per food + 10 for logging)
      const xp = (selectedFoods.length * 10) + 10;
      setEarnedXp(xp);
      setShowXp(true);

      setSelectedFoods([]);
      setShowModal(false);
      setLogMethod(null);
    } catch (error) {
      console.error('Error logging meal:', error);
      Alert.alert('Error', 'Failed to log meal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
        {/* Header */}
        <PageHeader 
          title="Log Your Meal" 
          subtitle="Choose your meal type"
        />

      {/* Meal Type Selector */}
      <AnimatedCard delay={100} type="pop" style={styles.mealTypeContainer}>
        {mealTypes.map((type, index) => (
          <View key={type.id} style={{ width: '48%', position: 'relative' }}>
            <View style={[styles.cardShadow, { backgroundColor: mealType === type.id ? '#1A3A2A' : 'rgba(0,0,0,0.1)', borderRadius: 20 }]} />
            <Animated.View style={getCardStyle(mealTypeAnims[index])}>
              <TouchableOpacity
                activeOpacity={1}
                onPressIn={() => handlePressIn(mealTypeAnims[index])}
                onPressOut={() => handlePressOut(mealTypeAnims[index])}
                style={[
                  styles.mealTypeCard,
                  mealType === type.id && styles.mealTypeCardActive,
                  { width: '100%' }
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMealType(type.id);
                }}
              >
                <Ionicons
                  name={type.icon as any}
                  size={28}
                  color={mealType === type.id ? Colors.primary : Colors.primaryLight}
                />
                <Text
                  style={[
                    styles.mealTypeLabel,
                    mealType === type.id && styles.mealTypeLabelActive,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ))}
      </AnimatedCard>

      {/* Logging Methods */}
      <View style={styles.methodsContainer}>
        <Text style={styles.sectionTitle}>How would you like to log?</Text>

        {/* Photo Logging */}
        <AnimatedCard delay={200} type="slide" style={{ position: 'relative', marginBottom: 16 }}>
          <View style={[styles.cardShadow, { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24 }]} />
          <Animated.View style={getCardStyle(methodAnims[0])}>
            <TouchableOpacity 
              activeOpacity={1}
              onPressIn={() => handlePressIn(methodAnims[0])}
              onPressOut={() => handlePressOut(methodAnims[0])}
              style={[styles.methodCard, { marginBottom: 0 }]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handlePhotoLog();
              }}
            >
              <View style={styles.methodIconContainer}>
                <Ionicons name="camera" size={32} color={Colors.primary} />
              </View>
              <View style={styles.methodContent}>
                <Text style={styles.methodTitle}>Take a Photo</Text>
                <Text style={styles.methodDescription}>
                  LiDAR + coin calibration for accurate portions
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          </Animated.View>
        </AnimatedCard>

        {/* Barcode Scanner */}
        <AnimatedCard delay={300} type="slide" style={{ position: 'relative', marginBottom: 16 }}>
          <View style={[styles.cardShadow, { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24 }]} />
          <Animated.View style={getCardStyle(methodAnims[1])}>
            <TouchableOpacity 
              activeOpacity={1}
              onPressIn={() => handlePressIn(methodAnims[1])}
              onPressOut={() => handlePressOut(methodAnims[1])}
              style={[styles.methodCard, { marginBottom: 0 }]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push('/barcode');
              }}
            >
              <View style={[styles.methodIconContainer, { backgroundColor: Colors.secondary + '15' }]}>
                <Ionicons name="barcode" size={32} color={Colors.secondary} />
              </View>
              <View style={styles.methodContent}>
                <Text style={styles.methodTitle}>Scan Barcode</Text>
                <Text style={styles.methodDescription}>
                  Scan packaged food, then photo your portion
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          </Animated.View>
        </AnimatedCard>

        {/* Voice Logging */}
        <AnimatedCard delay={400} type="slide" style={{ position: 'relative', marginBottom: 16 }}>
          <View style={[styles.cardShadow, { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24 }]} />
          <Animated.View style={getCardStyle(methodAnims[2])}>
            <TouchableOpacity 
              activeOpacity={1}
              onPressIn={() => handlePressIn(methodAnims[2])}
              onPressOut={() => handlePressOut(methodAnims[2])}
              style={[styles.methodCard, { marginBottom: 0 }]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleVoiceLog();
              }}
            >
              <View style={[styles.methodIconContainer, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="mic" size={32} color={Colors.accent} />
              </View>
              <View style={styles.methodContent}>
                <Text style={styles.methodTitle}>Voice Input</Text>
                <Text style={styles.methodDescription}>
                  Tell us what you ate
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          </Animated.View>
        </AnimatedCard>

        {/* Manual Logging */}
        <AnimatedCard delay={500} type="slide" style={{ position: 'relative', marginBottom: 16 }}>
          <View style={[styles.cardShadow, { backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 24 }]} />
          <Animated.View style={getCardStyle(methodAnims[3])}>
            <TouchableOpacity 
              activeOpacity={1}
              onPressIn={() => handlePressIn(methodAnims[3])}
              onPressOut={() => handlePressOut(methodAnims[3])}
              style={[styles.methodCard, { marginBottom: 0 }]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                handleManualLog();
              }}
            >
              <View style={[styles.methodIconContainer, { backgroundColor: Colors.success + '15' }]}>
                <Ionicons name="create" size={32} color={Colors.success} />
              </View>
              <View style={styles.methodContent}>
                <Text style={styles.methodTitle}>Manual Entry</Text>
                <Text style={styles.methodDescription}>
                  Search and add foods manually
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          </Animated.View>
        </AnimatedCard>
      </View>

      {/* Manual/Voice Input Modal */}
      <Modal visible={showModal} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {logMethod === 'voice' ? 'Voice Input' : 'Add Foods'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search foods..."
                placeholderTextColor={Colors.textLight}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  searchFoods(text);
                }}
              />
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <ScrollView style={styles.searchResults}>
                {searchResults.map((food, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.searchResultItem}
                    onPress={() => addFood(food)}
                  >
                    <View>
                      <Text style={styles.foodName}>{food.name}</Text>
                      <Text style={styles.foodInfo}>
                        {food.calories_per_100g} cal • {food.protein_per_100g}g protein
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={Colors.primary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Selected Foods */}
            {selectedFoods.length > 0 && (
              <View style={styles.selectedFoodsContainer}>
                <Text style={styles.selectedTitle}>Selected Foods</Text>
                {selectedFoods.map((food, index) => (
                  <View key={index} style={styles.selectedFoodItem}>
                    <View style={styles.selectedFoodInfo}>
                      <Text style={styles.selectedFoodName}>{food.name}</Text>
                      <Text style={styles.selectedFoodDetails}>
                        {food.quantity}g • {food.calories} cal
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFood(index)}>
                      <Ionicons name="close-circle" size={24} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Save Button */}
            <DuoButton
              title="Save Meal"
              onPress={saveMeal}
              disabled={loading || selectedFoods.length === 0}
              loading={loading}
              color={Colors.primary}
              size="medium"
              style={{ marginTop: 8 }}
            />
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
      {showXp && (
        <XpPopUp xp={earnedXp} onComplete={() => setShowXp(false)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mealTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  cardShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    bottom: -4,
  },
  mealTypeCard: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  mealTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '05',
  },
  mealTypeLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  mealTypeLabelActive: {
    color: Colors.primary,
  },
  methodsContainer: {
    marginBottom: 24,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  methodIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  methodContent: {
    flex: 1,
    marginLeft: 16,
  },
  methodTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
    lineHeight: 18,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(13, 8, 8, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '90%',
    borderTopWidth: 4,
    borderTopColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '700',
  },
  searchResults: {
    maxHeight: 250,
    marginBottom: 20,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  foodInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  selectedFoodsContainer: {
    marginBottom: 24,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedFoodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  selectedFoodInfo: {
    flex: 1,
  },
  selectedFoodName: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  selectedFoodDetails: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
});