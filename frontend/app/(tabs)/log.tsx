import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi, foodApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';

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

  const mealTypes = [
    { id: 'breakfast', label: 'Breakfast', icon: 'sunny' },
    { id: 'lunch', label: 'Lunch', icon: 'restaurant' },
    { id: 'dinner', label: 'Dinner', icon: 'moon' },
    { id: 'snack', label: 'Snack', icon: 'fast-food' },
  ];

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

      Alert.alert('Success', 'Meal logged successfully!');
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
      <View style={styles.header}>
        <Text style={styles.title}>Log Your Meal</Text>
        <Text style={styles.subtitle}>Choose your meal type</Text>
      </View>

      {/* Meal Type Selector */}
      <View style={styles.mealTypeContainer}>
        {mealTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.mealTypeCard,
              mealType === type.id && styles.mealTypeCardActive,
            ]}
            onPress={() => setMealType(type.id)}
          >
            <Ionicons
              name={type.icon as any}
              size={28}
              color={mealType === type.id ? Colors.white : Colors.primary}
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
        ))}
      </View>

      {/* Logging Methods */}
      <View style={styles.methodsContainer}>
        <Text style={styles.sectionTitle}>How would you like to log?</Text>

        {/* Photo Logging */}
        <TouchableOpacity style={styles.methodCard} onPress={handlePhotoLog}>
          <View style={styles.methodIconContainer}>
            <Ionicons name="camera" size={32} color={Colors.primary} />
          </View>
          <View style={styles.methodContent}>
            <Text style={styles.methodTitle}>Take a Photo</Text>
            <Text style={styles.methodDescription}>
              Use coin calibration for accurate portions
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
        </TouchableOpacity>

        {/* Voice Logging */}
        <TouchableOpacity style={styles.methodCard} onPress={handleVoiceLog}>
          <View style={styles.methodIconContainer}>
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

        {/* Manual Logging */}
        <TouchableOpacity style={styles.methodCard} onPress={handleManualLog}>
          <View style={styles.methodIconContainer}>
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
            <TouchableOpacity
              style={[styles.saveButton, selectedFoods.length === 0 && styles.saveButtonDisabled]}
              onPress={saveMeal}
              disabled={loading || selectedFoods.length === 0}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Meal</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  mealTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  mealTypeCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  mealTypeCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  mealTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  mealTypeLabelActive: {
    color: Colors.white,
  },
  methodsContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  methodIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodContent: {
    flex: 1,
    marginLeft: 16,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  searchResults: {
    maxHeight: 200,
    marginBottom: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  foodInfo: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  selectedFoodsContainer: {
    marginBottom: 16,
  },
  selectedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  selectedFoodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  selectedFoodInfo: {
    flex: 1,
  },
  selectedFoodName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  selectedFoodDetails: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
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