import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import PageHeader from '../../components/PageHeader';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import XpPopUp from '../../components/XpPopUp';

export default function LogScreen() {
  const router = useRouter();
  const { user } = useUser();
  const searchInputRef = useRef<TextInput>(null);
  const ENABLE_CAMERA_LOGGING = false;
  const [mealType, setMealType] = useState('breakfast');
  const [logMethod, setLogMethod] = useState<'photo' | 'manual' | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [configuringFood, setConfiguringFood] = useState<any | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [configQty, setConfigQty] = useState('');
  const [configUnit, setConfigUnit] = useState<'g' | 'oz'>('g');
  const [showXp, setShowXp] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);

  const voiceTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (voiceLoading) {
      Animated.timing(voiceTranslateY, {
        toValue: -20,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(voiceTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [voiceLoading, voiceTranslateY]);

  useEffect(() => {
    if (showModal && !configuringFood) {
      const t = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [showModal, configuringFood]);

  useEffect(() => {
    if (!showModal) {
      setVoiceLoading(false);
      setIsRecording(false);
      setRecording(null);
      setLastTranscript('');
    }
  }, [showModal]);

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

  const handleManualLog = () => {
    setLogMethod('manual');
    setShowModal(true);
  };

  const startVoiceRecording = async () => {
    if (voiceLoading || isRecording) return;
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to use voice logging');
      return;
    }

    try {
      setVoiceLoading(true);

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice logging');
        setVoiceLoading(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();

      setRecording(rec);
      setIsRecording(true);
      setLastTranscript('');
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

  const stopVoiceRecordingAndParse = async () => {
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

      const result = await mealApi.voiceToMeal(uri, user.id);
      const foods = result?.foods || [];
      const transcript = result?.transcript || '';

      setLastTranscript(transcript);
      if (foods.length === 0) {
        Alert.alert('No foods detected', transcript ? `Heard: ${transcript}` : 'Try speaking again');
        return;
      }

      setSelectedFoods(foods);
    } catch (e) {
      console.error('Voice-to-meal failed:', e);
      Alert.alert('Error', 'Failed to process voice meal');
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleFoodSelect = (food: any) => {
    setConfiguringFood(food);
    setConfigQty(food.serving_size ? String(food.serving_size) : '100');
    setConfigUnit('g');
    setEditingIndex(null);
  };

  const handleEditFood = (index: number) => {
    const food = selectedFoods[index];
    setEditingIndex(index);
    setConfiguringFood(food);
    // Use displayQuantity if available (string), otherwise quantity (number)
    setConfigQty(food.displayQuantity ? String(food.displayQuantity) : String(food.quantity));
    setConfigUnit(food.displayUnit || 'g');
  };

  const getCalculatedMacros = () => {
    if (!configuringFood) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const qty = parseFloat(configQty) || 0;
    const grams = configUnit === 'oz' ? qty * 28.3495 : qty;
    const ratio = grams / 100;
    
    return {
      calories: Math.round(configuringFood.calories_per_100g * ratio),
      protein: Math.round(configuringFood.protein_per_100g * ratio),
      carbs: Math.round(configuringFood.carbs_per_100g * ratio),
      fat: Math.round(configuringFood.fat_per_100g * ratio),
      grams: Math.round(grams),
    };
  };

  const confirmAddFood = () => {
    if (!configuringFood) return;
    
    const macros = getCalculatedMacros();
    const newFood = {
      ...configuringFood,
      name: configuringFood.name,
      quantity: macros.grams, // Backend expects grams typically
      displayQuantity: configQty,
      displayUnit: configUnit,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    };
    
    if (editingIndex !== null) {
      const updated = [...selectedFoods];
      updated[editingIndex] = newFood;
      setSelectedFoods(updated);
      setEditingIndex(null);
    } else {
      setSelectedFoods([...selectedFoods, newFood]);
    }

    setConfiguringFood(null);
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

      const xp = (selectedFoods.length * 10) + 10;
      setEarnedXp(xp);
      setShowXp(true);

      setSelectedFoods([]);
      setShowModal(false);
      setLogMethod(null);
      setEditingIndex(null);
    } catch (error) {
      console.error('Error logging meal:', error);
      Alert.alert('Error', 'Failed to log meal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader 
        title="Log Your Meal" 
        subtitle="Choose your meal type"
      />
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >

        {/* Meal Type Selector */}
        <AnimatedCard delay={100} type="pop" style={styles.mealTypeContainer}>
          {mealTypes.map((type) => (
            <TouchableOpacity
              key={type.id}
              activeOpacity={0.9}
              style={[
                styles.mealTypeCard,
                mealType === type.id && styles.mealTypeCardActive,
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
          ))}
        </AnimatedCard>

        {/* Logging Methods */}
        <View style={styles.methodsContainer}>
          <Text style={styles.sectionTitle}>How would you like to log?</Text>

          {ENABLE_CAMERA_LOGGING && (
            <AnimatedCard delay={150} type="slide" style={styles.methodCardWrapper}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.methodCard}
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
                    Photo logging will return in a future update
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
              </TouchableOpacity>
            </AnimatedCard>
          )}

          {/* Voice Search (Launch MVP) */}
          <AnimatedCard delay={200} type="slide" style={styles.methodCardWrapper}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.methodCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setLogMethod('manual');
                setShowModal(true);
              }}
            >
              <View style={styles.methodIconContainer}>
                <Ionicons name="mic" size={32} color={Colors.primary} />
              </View>
              <View style={styles.methodContent}>
                <Text style={styles.methodTitle}>Voice Search</Text>
                <Text style={styles.methodDescription}>
                  Tap the mic on your keyboard and speak
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          </AnimatedCard>

          {/* Barcode Scanner */}
          <AnimatedCard delay={300} type="slide" style={styles.methodCardWrapper}>
            <TouchableOpacity 
              activeOpacity={0.9}
              style={[styles.methodCard, { borderColor: Colors.secondary }]} 
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
          </AnimatedCard>

          {/* Manual Logging */}
          <AnimatedCard delay={500} type="slide" style={styles.methodCardWrapper}>
            <TouchableOpacity 
              activeOpacity={0.9}
              style={[styles.methodCard, { borderColor: Colors.success }]} 
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
          </AnimatedCard>
        </View>

        {/* Manual/Voice Input Modal */}
        <Modal visible={showModal} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {configuringFood ? 'Configure Food' : 'Add Foods'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (configuringFood) {
                        setConfiguringFood(null);
                      } else {
                        setShowModal(false);
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name={configuringFood ? "arrow-back" : "close"} size={28} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.modalScrollView}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                {configuringFood ? (
                  <View style={styles.configContainer}>
                    <View style={styles.configHeader}>
                      <Text style={styles.configTitle}>{configuringFood.name}</Text>
                      <Text style={styles.configSubtitle}>
                        {configuringFood.calories_per_100g} cal per 100g
                      </Text>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.qtyInputContainer}>
                        <Text style={styles.qtyLabel}>Quantity</Text>
                        <TextInput
                          style={styles.qtyInput}
                          value={configQty}
                          onChangeText={setConfigQty}
                          keyboardType="numeric"
                          placeholder="0"
                          placeholderTextColor={Colors.textLight}
                          selectionColor={Colors.primary}
                        />
                      </View>
                      <View style={styles.unitToggle}>
                        <TouchableOpacity
                          style={[styles.unitOption, configUnit === 'g' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setConfigUnit('g');
                          }}
                        >
                          <Text style={[styles.unitText, configUnit === 'g' && styles.unitTextActive]}>g</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.unitOption, configUnit === 'oz' && styles.unitOptionActive]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setConfigUnit('oz');
                          }}
                        >
                          <Text style={[styles.unitText, configUnit === 'oz' && styles.unitTextActive]}>oz</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.macroPreview}>
                      {[
                        { label: 'Calories', value: getCalculatedMacros().calories, color: Colors.primary },
                        { label: 'Protein', value: getCalculatedMacros().protein + 'g', color: Colors.protein },
                        { label: 'Carbs', value: getCalculatedMacros().carbs + 'g', color: Colors.carbs },
                        { label: 'Fat', value: getCalculatedMacros().fat + 'g', color: Colors.fat },
                      ].map((macro, i) => (
                        <View key={i} style={styles.macroCard}>
                          <Text style={[styles.macroValue, { color: macro.color }]}>{macro.value}</Text>
                          <Text style={styles.macroLabel}>{macro.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <>
                    {/* Voice Search Interaction */}
                    <Animated.View style={[
                      styles.voiceSearchCentered,
                      { transform: [{ translateY: voiceTranslateY }] }
                    ]}>
                      {!voiceLoading ? (
                        <>
                          <View style={styles.voicePromptContainerCentered}>
                            <Text style={styles.voicePromptTitle}>Tap to speak your meal</Text>
                            <Text style={styles.voicePromptSub}>{"\"2 boiled eggs and a bowl of poha\""}</Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.micButtonLarge, 
                              isRecording && styles.micButtonActive,
                            ]}
                            onPress={() => {
                              if (isRecording) {
                                stopVoiceRecordingAndParse();
                              } else {
                                startVoiceRecording();
                              }
                            }}
                          >
                            <Ionicons
                              name={isRecording ? 'stop' : 'mic'}
                              size={32}
                              color={isRecording ? Colors.white : Colors.primary}
                            />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <View style={styles.processingContainer}>
                          <ActivityIndicator size="large" color={Colors.primary} />
                          <Text style={styles.processingText}>Analyzing your meal...</Text>
                        </View>
                      )}
                    </Animated.View>

                    {!voiceLoading && !!lastTranscript && (
                      <View style={styles.transcriptContainer}>
                        <Text style={styles.transcriptLabel}>Heard:</Text>
                        <Text style={styles.transcriptText}>{"\""}{lastTranscript}{"\""}</Text>
                      </View>
                    )}

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <View style={styles.searchResults}>
                        {searchResults.map((food, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.searchResultItem}
                            onPress={() => handleFoodSelect(food)}
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
                      </View>
                    )}

                    {/* Selected Foods */}
                    {selectedFoods.length > 0 && (
                      <View style={styles.selectedFoodsContainer}>
                        <Text style={styles.selectedTitle}>Selected Foods</Text>
                        {selectedFoods.map((food, index) => (
                          <View key={index} style={styles.selectedFoodItem}>
                            <View style={styles.selectedFoodInfo}>
                              <Text style={styles.selectedFoodName}>
                                {food.name.split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </Text>
                              <Text style={styles.selectedFoodDetails}>
                                {food.displayQuantity || food.quantity} {food.displayUnit || 'g'} • {food.calories} CAL
                              </Text>
                            </View>
                            <View style={styles.selectedFoodActions}>
                              <TouchableOpacity 
                                onPress={() => handleEditFood(index)}
                                style={styles.actionButton}
                              >
                                <Ionicons name="pencil" size={20} color={Colors.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity 
                                onPress={() => removeFood(index)}
                                style={styles.actionButton}
                              >
                                <Ionicons name="close-circle" size={24} color={Colors.error} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
                </ScrollView>

                {/* Sticky Footer */}
                <View style={[styles.modalFooter, { marginTop: 'auto' }]}>
                  {configuringFood ? (
                    <View style={styles.actionRow}>
                      <DuoButton
                        title="Cancel"
                        onPress={() => setConfiguringFood(null)}
                        color={Colors.white}
                        shadowColor={Colors.border}
                        textStyle={{ color: Colors.text }}
                        style={{ flex: 1 }}
                      />
                      <DuoButton
                        title={editingIndex !== null ? "Update Food" : "Add Food"}
                        onPress={confirmAddFood}
                        color={Colors.primary}
                        style={{ flex: 2 }}
                      />
                    </View>
                  ) : (
                    <DuoButton
                      title="Save Meal"
                      onPress={saveMeal}
                      disabled={loading || selectedFoods.length === 0}
                      loading={loading}
                      color={Colors.primary}
                      size="large"
                    />
                  )}
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <View style={{ height: 100 }} />
        {showXp && (
          <XpPopUp xp={earnedXp} onComplete={() => setShowXp(false)} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
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
  mealTypeCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 8,
  },
  mealTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
    borderBottomWidth: 8,
  },
  mealTypeLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mealTypeLabelActive: {
    color: Colors.primary,
  },
  methodsContainer: {
    marginBottom: 24,
  },
  methodCardWrapper: {
    marginBottom: 16,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  methodIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 0,
    paddingBottom: 0,
    maxHeight: '85%',
    minHeight: 420,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  modalScrollView: {
    flexGrow: 0, 
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  modalFooter: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
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
  voiceSearchCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 32,
    padding: 32,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    gap: 20,
  },
  voicePromptContainerCentered: {
    alignItems: 'center',
  },
  voicePromptTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  voicePromptSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  micButtonLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.white,
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcriptContainer: {
    backgroundColor: Colors.primary + '08',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  transcriptLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  transcriptText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    fontStyle: 'italic',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  micButtonDisabled: {
    backgroundColor: Colors.backgroundSecondary,
    borderColor: Colors.border,
    opacity: 0.6,
  },
  searchResults: {
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
  selectedFoodActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  processingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  processingText: {
    color: Colors.primary,
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  configContainer: {
    gap: 20,
    marginBottom: 20,
  },
  configHeader: {
    marginBottom: 4,
  },
  configTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  configSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    height: 72,
  },
  qtyInputContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  qtyLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  qtyInput: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    height: 32,
    padding: 0,
  },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  unitOption: {
    paddingHorizontal: 20,
    height: '100%',
    justifyContent: 'center',
    borderRadius: 14,
  },
  unitOptionActive: {
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  unitText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textLight,
  },
  unitTextActive: {
    color: Colors.primary,
  },
  macroPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  voiceHint: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
