import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { userApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';

export default function Onboarding() {
  const router = useRouter();
  const { setUser } = useUser();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male',
    height: '',
    weight: '',
    goal: 'maintain',
    activity_level: 'moderate',
    dietary_preference: 'no_restriction',
  });

  const goals = [
    { id: 'lose_weight', label: 'Lose Weight', icon: 'trending-down' },
    { id: 'gain_muscle', label: 'Gain Muscle', icon: 'fitness' },
    { id: 'maintain', label: 'Maintain', icon: 'checkmark-circle' },
    { id: 'general_health', label: 'General Health', icon: 'heart' },
  ];

  const activityLevels = [
    { id: 'sedentary', label: 'Sedentary', desc: 'Little to no exercise' },
    { id: 'light', label: 'Light', desc: '1-3 days/week' },
    { id: 'moderate', label: 'Moderate', desc: '3-5 days/week' },
    { id: 'active', label: 'Active', desc: '5-6 days/week' },
    { id: 'very_active', label: 'Very Active', desc: 'Daily exercise' },
  ];

  const dietaryPreferences = [
    { id: 'vegetarian', label: 'Vegetarian', icon: 'leaf' },
    { id: 'vegan', label: 'Vegan', icon: 'leaf-outline' },
    { id: 'non_veg', label: 'Non-Vegetarian', icon: 'restaurant' },
    { id: 'no_restriction', label: 'No Restriction', icon: 'fast-food' },
  ];

  const handleNext = () => {
    if (step === 1 && (!formData.name || !formData.age)) {
      Alert.alert('Missing Info', 'Please fill in all fields');
      return;
    }
    if (step === 2 && (!formData.height || !formData.weight)) {
      Alert.alert('Missing Info', 'Please enter your height and weight');
      return;
    }
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const userData = {
        name: formData.name,
        age: parseInt(formData.age),
        gender: formData.gender,
        height: parseFloat(formData.height),
        weight: parseFloat(formData.weight),
        goal: formData.goal,
        activity_level: formData.activity_level,
        dietary_preference: formData.dietary_preference,
      };
      
      const response = await userApi.onboard(userData);
      await setUser(response);
      router.replace('/(tabs)/home');
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert('Error', 'Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>NutriSnap</Text>
          <View style={styles.progressContainer}>
            {[1, 2, 3, 4].map((s) => (
              <View
                key={s}
                style={[
                  styles.progressDot,
                  s === step && styles.progressDotActive,
                  s < step && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>
        </View>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Let's get started!</Text>
            <Text style={styles.subtitle}>Tell us a bit about yourself</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={Colors.textLight}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your age"
                placeholderTextColor={Colors.textLight}
                value={formData.age}
                onChangeText={(text) => setFormData({ ...formData, age: text })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    formData.gender === 'male' && styles.genderButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, gender: 'male' })}
                >
                  <Ionicons 
                    name="male" 
                    size={24} 
                    color={formData.gender === 'male' ? Colors.white : Colors.primary} 
                  />
                  <Text
                    style={[
                      styles.genderText,
                      formData.gender === 'male' && styles.genderTextActive,
                    ]}
                  >
                    Male
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    formData.gender === 'female' && styles.genderButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, gender: 'female' })}
                >
                  <Ionicons 
                    name="female" 
                    size={24} 
                    color={formData.gender === 'female' ? Colors.white : Colors.primary} 
                  />
                  <Text
                    style={[
                      styles.genderText,
                      formData.gender === 'female' && styles.genderTextActive,
                    ]}
                  >
                    Female
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Step 2: Physical Stats */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Your measurements</Text>
            <Text style={styles.subtitle}>This helps us calculate your daily targets</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 170"
                placeholderTextColor={Colors.textLight}
                value={formData.height}
                onChangeText={(text) => setFormData({ ...formData, height: text })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 70"
                placeholderTextColor={Colors.textLight}
                value={formData.weight}
                onChangeText={(text) => setFormData({ ...formData, weight: text })}
                keyboardType="numeric"
              />
            </View>
          </View>
        )}

        {/* Step 3: Goals */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>What's your goal?</Text>
            <Text style={styles.subtitle}>We'll personalize your experience</Text>
            
            <View style={styles.optionsGrid}>
              {goals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.optionCard,
                    formData.goal === goal.id && styles.optionCardActive,
                  ]}
                  onPress={() => setFormData({ ...formData, goal: goal.id })}
                >
                  <Ionicons
                    name={goal.icon as any}
                    size={32}
                    color={formData.goal === goal.id ? Colors.white : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      formData.goal === goal.id && styles.optionLabelActive,
                    ]}
                  >
                    {goal.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Activity Level</Text>
              {activityLevels.map((level) => (
                <TouchableOpacity
                  key={level.id}
                  style={[
                    styles.listOption,
                    formData.activity_level === level.id && styles.listOptionActive,
                  ]}
                  onPress={() => setFormData({ ...formData, activity_level: level.id })}
                >
                  <View style={styles.listOptionContent}>
                    <Text
                      style={[
                        styles.listOptionLabel,
                        formData.activity_level === level.id && styles.listOptionLabelActive,
                      ]}
                    >
                      {level.label}
                    </Text>
                    <Text style={styles.listOptionDesc}>{level.desc}</Text>
                  </View>
                  {formData.activity_level === level.id && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 4: Dietary Preferences */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Dietary preference</Text>
            <Text style={styles.subtitle}>Help us suggest the right foods</Text>
            
            <View style={styles.optionsGrid}>
              {dietaryPreferences.map((pref) => (
                <TouchableOpacity
                  key={pref.id}
                  style={[
                    styles.optionCard,
                    formData.dietary_preference === pref.id && styles.optionCardActive,
                  ]}
                  onPress={() => setFormData({ ...formData, dietary_preference: pref.id })}
                >
                  <Ionicons
                    name={pref.icon as any}
                    size={32}
                    color={formData.dietary_preference === pref.id ? Colors.white : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      formData.dietary_preference === pref.id && styles.optionLabelActive,
                    ]}
                  >
                    {pref.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.tipCard}>
              <Ionicons name="information-circle" size={24} color={Colors.primary} />
              <Text style={styles.tipText}>
                Place a coin next to your food for accurate portion tracking!
              </Text>
            </View>
          </View>
        )}

        {/* Navigation Buttons */}
        <View style={styles.buttonContainer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextButton, step === 1 && styles.nextButtonFull]}
            onPress={handleNext}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.nextButtonText}>
                {step === 4 ? 'Get Started' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 24,
    textAlign: 'center',
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 40,
    height: 4,
    backgroundColor: Colors.gray300,
    borderRadius: 2,
  },
  progressDotActive: {
    backgroundColor: Colors.primary,
  },
  progressDotCompleted: {
    backgroundColor: Colors.primary,
  },
  stepContainer: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  genderButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  genderText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  genderTextActive: {
    color: Colors.white,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  optionCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  optionCardActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  optionLabelActive: {
    color: Colors.white,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  listOptionActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  listOptionContent: {
    flex: 1,
  },
  listOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  listOptionLabelActive: {
    color: Colors.primary,
  },
  listOptionDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  backButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  nextButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
});