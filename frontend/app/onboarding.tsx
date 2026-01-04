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
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { userApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import AnimatedCard from '../components/AnimatedCard';

import DuoButton from '../components/DuoButton';

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    let didSucceed = false;
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
      didSucceed = true;
      router.replace('/(tabs)/home');
    } catch (error) {
      console.error('Onboarding error:', error);
      Alert.alert('Error', 'Failed to complete onboarding. Please try again.');
    } finally {
      Haptics.notificationAsync(
        didSucceed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      ).catch(() => {});
      setLoading(false);
    }
  };

  const stepMeta = (() => {
    switch (step) {
      case 1:
        return {
          title: 'Tell us about you',
          subtitle: 'This helps us personalize your plan.',
        };
      case 2:
        return {
          title: 'Your measurements',
          subtitle: 'We’ll calculate your daily targets.',
        };
      case 3:
        return {
          title: 'Set your goal',
          subtitle: 'Pick what you want to optimize for.',
        };
      default:
        return {
          title: 'Diet preference',
          subtitle: 'So we can suggest better foods.',
        };
    }
  })();

  return (
    <LinearGradient colors={[Colors.background, Colors.backgroundSecondary]} style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.screen}>
          <View style={styles.headerWrap}>
            <PageHeader
              title={stepMeta.title}
              subtitle={stepMeta.subtitle}
              rightComponent={
                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>Step {step} of 4</Text>
                </View>
              }
            />

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
            </View>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

          {step === 1 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Your name"
                  placeholderTextColor={Colors.textLight}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                />
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldCard, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Age</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="18"
                    placeholderTextColor={Colors.textLight}
                    value={formData.age}
                    onChangeText={(text) => setFormData({ ...formData, age: text })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.sectionLabel}>Gender</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[styles.choiceCard, formData.gender === 'male' && styles.choiceCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, gender: 'male' });
                  }}
                >
                  <Ionicons
                    name="male"
                    size={22}
                    color={formData.gender === 'male' ? Colors.primary : Colors.text}
                  />
                  <Text style={[styles.choiceCardText, formData.gender === 'male' && styles.choiceCardTextActive]}>
                    Male
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.choiceCard, formData.gender === 'female' && styles.choiceCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, gender: 'female' });
                  }}
                >
                  <Ionicons
                    name="female"
                    size={22}
                    color={formData.gender === 'female' ? Colors.primary : Colors.text}
                  />
                  <Text
                    style={[
                      styles.choiceCardText,
                      formData.gender === 'female' && styles.choiceCardTextActive,
                    ]}
                  >
                    Female
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          )}

          {step === 2 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <View style={styles.fieldRow}>
                <View style={[styles.fieldCard, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Height (cm)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="170"
                    placeholderTextColor={Colors.textLight}
                    value={formData.height}
                    onChangeText={(text) => setFormData({ ...formData, height: text })}
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.fieldCard, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Weight (kg)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="70"
                    placeholderTextColor={Colors.textLight}
                    value={formData.weight}
                    onChangeText={(text) => setFormData({ ...formData, weight: text })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.microTip}>
                <Ionicons name="sparkles" size={18} color={Colors.primary} />
                <Text style={styles.microTipText}>You can adjust these later in Profile.</Text>
              </View>
            </AnimatedCard>
          )}

          {step === 3 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <Text style={styles.sectionLabel}>Goal</Text>
              <View style={styles.optionsGrid}>
                {goals.map((goal) => (
                  <TouchableOpacity
                    key={goal.id}
                    style={[styles.optionCard, formData.goal === goal.id && styles.optionCardActive]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFormData({ ...formData, goal: goal.id });
                    }}
                  >
                    <Ionicons
                      name={goal.icon as any}
                      size={26}
                      color={formData.goal === goal.id ? Colors.primary : Colors.primaryLight}
                    />
                    <Text style={[styles.optionLabel, formData.goal === goal.id && styles.optionLabelActive]}>
                      {goal.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Activity level</Text>
              {activityLevels.map((level) => (
                <TouchableOpacity
                  key={level.id}
                  style={[styles.listOption, formData.activity_level === level.id && styles.listOptionActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, activity_level: level.id });
                  }}
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
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </AnimatedCard>
          )}

          {step === 4 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <Text style={styles.sectionLabel}>Preference</Text>
              <View style={styles.optionsGrid}>
                {dietaryPreferences.map((pref) => (
                  <TouchableOpacity
                    key={pref.id}
                    style={[
                      styles.optionCard,
                      formData.dietary_preference === pref.id && styles.optionCardActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFormData({ ...formData, dietary_preference: pref.id });
                    }}
                  >
                    <Ionicons
                      name={pref.icon as any}
                      size={26}
                      color={formData.dietary_preference === pref.id ? Colors.primary : Colors.primaryLight}
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
                <Ionicons name="information-circle" size={20} color={Colors.primary} />
                <Text style={styles.tipText}>Place a coin next to your food for accurate portion tracking.</Text>
              </View>
            </AnimatedCard>
          )}

          </ScrollView>

          <View style={styles.bottomBar}>
            <DuoButton
              title="Back"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setStep(step - 1);
              }}
              disabled={step === 1 || loading}
              color={Colors.white}
              shadowColor={Colors.border}
              textStyle={{ color: Colors.primary }}
              style={{ flex: 1 }}
              size="medium"
            />

            <DuoButton
              title={step === 4 ? 'Finish' : 'Continue'}
              onPress={handleNext}
              disabled={loading}
              loading={loading}
              color={Colors.primary}
              style={{ flex: 2 }}
              size="medium"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screen: {
    flex: 1,
  },
  headerWrap: {
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 140,
    justifyContent: 'center',
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  progressTrack: {
    marginTop: 16,
    marginBottom: 8,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: Colors.primary,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  stepContainer: {
    marginTop: 8,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderBottomWidth: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldInput: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    paddingVertical: 4,
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  choiceCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 16,
    borderBottomWidth: 6,
  },
  choiceCardActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.primary,
    borderBottomWidth: 6,
  },
  choiceCardText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  choiceCardTextActive: {
    color: Colors.primary,
  },
  microTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    marginTop: 8,
    borderBottomWidth: 6,
  },
  microTipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    fontWeight: '800',
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
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 6,
  },
  optionCardActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.primary,
    borderBottomWidth: 6,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  optionLabelActive: {
    color: Colors.primary,
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderBottomWidth: 6,
  },
  listOptionActive: {
    borderColor: Colors.primary,
    borderBottomWidth: 6,
  },
  listOptionContent: {
    flex: 1,
  },
  listOptionLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  listOptionLabelActive: {
    color: Colors.primary,
  },
  listOptionDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 16,
    borderBottomWidth: 6,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
    fontWeight: '800',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  backButtonDisabled: {
    borderColor: Colors.borderLight,
  },
  backButtonTextDisabled: {
    color: Colors.textLight,
  },
  nextButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.white,
  },
});