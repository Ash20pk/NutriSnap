import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { userApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import AnimatedCard from '../components/AnimatedCard';
import DuoButton from '../components/DuoButton';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ITEM_HEIGHT = 50;

// Generate arrays for DOB picker
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => currentYear - 10 - i); // 10 to 110 years ago
const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month, 0).getDate();
};

export default function Onboarding() {
  const router = useRouter();
  const { setUser } = useUser();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showDOBPicker, setShowDOBPicker] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    dobYear: currentYear - 25,
    dobMonth: 1,
    dobDay: 1,
    gender: 'male',
    height: '',
    weight: '',
    goal: 'maintain',
    activity_level: 'moderate',
    dietary_preference: 'no_restriction',
  });

  const goals = [
    { id: 'lose_weight', label: 'Lose Weight', icon: 'flame', emoji: '🔥', desc: 'Burn fat & get lean' },
    { id: 'gain_muscle', label: 'Build Muscle', icon: 'barbell', emoji: '💪', desc: 'Grow stronger' },
    { id: 'maintain', label: 'Stay Fit', icon: 'checkmark-circle', emoji: '✨', desc: 'Keep the balance' },
    { id: 'general_health', label: 'Be Healthy', icon: 'heart', emoji: '❤️', desc: 'Feel your best' },
  ];

  const activityLevels = [
    { id: 'sedentary', label: 'Couch Mode', desc: 'Mostly sitting', emoji: '🛋️' },
    { id: 'light', label: 'Easy Going', desc: 'Light walks, 1-2x/week', emoji: '🚶' },
    { id: 'moderate', label: 'Active', desc: 'Regular exercise, 3-5x/week', emoji: '🏃' },
    { id: 'active', label: 'Athlete', desc: 'Hard training, 5-6x/week', emoji: '🏋️' },
    { id: 'very_active', label: 'Beast Mode', desc: 'Intense daily workouts', emoji: '🦾' },
  ];

  const dietaryPreferences = [
    { id: 'vegetarian', label: 'Vegetarian', icon: 'leaf', emoji: '🥬', desc: 'No meat' },
    { id: 'vegan', label: 'Vegan', icon: 'leaf-outline', emoji: '🌱', desc: 'Plant power' },
    { id: 'non_veg', label: 'Non-Veg', icon: 'restaurant', emoji: '🍖', desc: 'Everything goes' },
    { id: 'no_restriction', label: 'Flexible', icon: 'fast-food', emoji: '🍽️', desc: 'I eat it all' },
  ];

  const calculateAge = () => {
    const today = new Date();
    const birthDate = new Date(formData.dobYear, formData.dobMonth - 1, formData.dobDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDOB = () => {
    const month = months.find(m => m.value === formData.dobMonth)?.label || '';
    return `${month} ${formData.dobDay}, ${formData.dobYear}`;
  };

  const handleNext = () => {
    if (step === 1 && !formData.name) {
      Alert.alert('Hey there!', "What's your name? We'd love to know!");
      return;
    }
    if (step === 2 && (!formData.height || !formData.weight)) {
      Alert.alert('Almost there!', 'We need your measurements to create your plan');
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
      // Format DOB as ISO string
      const dobString = `${formData.dobYear}-${String(formData.dobMonth).padStart(2, '0')}-${String(formData.dobDay).padStart(2, '0')}`;

      const userData = {
        name: formData.name,
        date_of_birth: dobString,
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
      Alert.alert('Oops!', 'Something went wrong. Let\'s try again!');
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
          title: "Let's get to know you!",
          subtitle: 'Your journey to better health starts here',
          emoji: '👋',
        };
      case 2:
        return {
          title: 'Your body, your stats',
          subtitle: "We'll calculate your perfect daily targets",
          emoji: '📊',
        };
      case 3:
        return {
          title: "What's your mission?",
          subtitle: 'Pick your superpower goal',
          emoji: '🎯',
        };
      default:
        return {
          title: 'How do you eat?',
          subtitle: "We'll personalize your food suggestions",
          emoji: '🍽️',
        };
    }
  })();

  // DOB Picker Components
  const WheelPicker = ({
    data,
    selectedValue,
    onValueChange,
    renderLabel
  }: {
    data: any[],
    selectedValue: any,
    onValueChange: (value: any) => void,
    renderLabel: (item: any) => string
  }) => {
    const flatListRef = useRef<FlatList>(null);
    const selectedIndex = data.findIndex(item =>
      typeof item === 'object' ? item.value === selectedValue : item === selectedValue
    );

    const onScrollEnd = useCallback((event: any) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const index = Math.round(offsetY / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(index, data.length - 1));
      const item = data[clampedIndex];
      const value = typeof item === 'object' ? item.value : item;
      if (value !== selectedValue) {
        Haptics.selectionAsync().catch(() => {});
        onValueChange(value);
      }
    }, [data, selectedValue, onValueChange]);

    return (
      <View style={styles.wheelContainer}>
        <View style={styles.wheelHighlight} />
        <FlatList
          ref={flatListRef}
          data={data}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item, index }) => {
            const value = typeof item === 'object' ? item.value : item;
            const isSelected = value === selectedValue;
            return (
              <View style={styles.wheelItem}>
                <Text style={[
                  styles.wheelItemText,
                  isSelected && styles.wheelItemTextSelected
                ]}>
                  {renderLabel(item)}
                </Text>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={onScrollEnd}
          contentContainerStyle={{
            paddingVertical: ITEM_HEIGHT * 2,
          }}
          initialScrollIndex={selectedIndex >= 0 ? selectedIndex : 0}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
        />
      </View>
    );
  };

  const daysInSelectedMonth = getDaysInMonth(formData.dobYear, formData.dobMonth);
  const days = Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1);

  // Adjust day if current selection is invalid
  React.useEffect(() => {
    if (formData.dobDay > daysInSelectedMonth) {
      setFormData(prev => ({ ...prev, dobDay: daysInSelectedMonth }));
    }
  }, [formData.dobMonth, formData.dobYear, daysInSelectedMonth]);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.screen}>
        <PageHeader
          title={stepMeta.title}
          subtitle={stepMeta.subtitle}
          rightComponent={
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>{step}/4</Text>
            </View>
          }
        />

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
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
                <Text style={styles.fieldLabel}>What should we call you?</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Your awesome name"
                  placeholderTextColor={Colors.textLight}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={styles.fieldCard}
                onPress={() => setShowDOBPicker(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.fieldLabel}>When were you born?</Text>
                <View style={styles.dobDisplayRow}>
                  <Text style={styles.fieldInput}>{formatDOB()}</Text>
                  <View style={styles.ageChip}>
                    <Text style={styles.ageChipText}>{calculateAge()} years old</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>I am...</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[styles.genderCard, formData.gender === 'male' && styles.genderCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, gender: 'male' });
                  }}
                >
                  <Text style={styles.genderEmoji}>👨</Text>
                  <Text style={[styles.genderText, formData.gender === 'male' && styles.genderTextActive]}>
                    Male
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.genderCard, formData.gender === 'female' && styles.genderCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, gender: 'female' });
                  }}
                >
                  <Text style={styles.genderEmoji}>👩</Text>
                  <Text style={[styles.genderText, formData.gender === 'female' && styles.genderTextActive]}>
                    Female
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedCard>
          )}

          {step === 2 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <View style={styles.measurementRow}>
                <View style={[styles.measurementCard, { flex: 1 }]}>
                  <Text style={styles.measurementEmoji}>📏</Text>
                  <Text style={styles.fieldLabel}>Height</Text>
                  <View style={styles.inputWithUnit}>
                    <TextInput
                      style={styles.measurementInput}
                      placeholder="170"
                      placeholderTextColor={Colors.textLight}
                      value={formData.height}
                      onChangeText={(text) => setFormData({ ...formData, height: text })}
                      keyboardType="numeric"
                    />
                    <Text style={styles.unitText}>cm</Text>
                  </View>
                </View>

                <View style={[styles.measurementCard, { flex: 1 }]}>
                  <Text style={styles.measurementEmoji}>⚖️</Text>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <View style={styles.inputWithUnit}>
                    <TextInput
                      style={styles.measurementInput}
                      placeholder="70"
                      placeholderTextColor={Colors.textLight}
                      value={formData.weight}
                      onChangeText={(text) => setFormData({ ...formData, weight: text })}
                      keyboardType="numeric"
                    />
                    <Text style={styles.unitText}>kg</Text>
                  </View>
                </View>
              </View>

              <View style={styles.funTip}>
                <Text style={styles.funTipEmoji}>💡</Text>
                <Text style={styles.funTipText}>
                  We'll remind you to check your weight monthly to keep your targets accurate!
                </Text>
              </View>
            </AnimatedCard>
          )}

          {step === 3 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <View style={styles.goalsGrid}>
                {goals.map((goal) => (
                  <TouchableOpacity
                    key={goal.id}
                    style={[styles.goalCard, formData.goal === goal.id && styles.goalCardActive]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFormData({ ...formData, goal: goal.id });
                    }}
                  >
                    <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                    <Text style={[styles.goalLabel, formData.goal === goal.id && styles.goalLabelActive]}>
                      {goal.label}
                    </Text>
                    <Text style={styles.goalDesc}>{goal.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>How active are you?</Text>
              {activityLevels.map((level) => (
                <TouchableOpacity
                  key={level.id}
                  style={[styles.activityCard, formData.activity_level === level.id && styles.activityCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormData({ ...formData, activity_level: level.id });
                  }}
                >
                  <Text style={styles.activityEmoji}>{level.emoji}</Text>
                  <View style={styles.activityContent}>
                    <Text style={[
                      styles.activityLabel,
                      formData.activity_level === level.id && styles.activityLabelActive
                    ]}>
                      {level.label}
                    </Text>
                    <Text style={styles.activityDesc}>{level.desc}</Text>
                  </View>
                  {formData.activity_level === level.id && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </AnimatedCard>
          )}

          {step === 4 && (
            <AnimatedCard type="pop" delay={100} style={styles.stepContainer}>
              <View style={styles.dietGrid}>
                {dietaryPreferences.map((pref) => (
                  <TouchableOpacity
                    key={pref.id}
                    style={[
                      styles.dietCard,
                      formData.dietary_preference === pref.id && styles.dietCardActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFormData({ ...formData, dietary_preference: pref.id });
                    }}
                  >
                    <Text style={styles.dietEmoji}>{pref.emoji}</Text>
                    <Text style={[
                      styles.dietLabel,
                      formData.dietary_preference === pref.id && styles.dietLabelActive
                    ]}>
                      {pref.label}
                    </Text>
                    <Text style={styles.dietDesc}>{pref.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.finalTip}>
                <Text style={styles.finalTipEmoji}>🎉</Text>
                <Text style={styles.finalTipTitle}>You're all set!</Text>
                <Text style={styles.finalTipText}>
                  Hit finish and let's start your health journey together
                </Text>
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
            title={step === 4 ? "Let's Go!" : 'Next'}
            onPress={handleNext}
            disabled={loading}
            loading={loading}
            color={Colors.primary}
            style={{ flex: 2 }}
            size="medium"
          />
        </View>
      </View>

      {/* DOB Picker Modal */}
      <Modal
        visible={showDOBPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDOBPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>When's your birthday?</Text>
              <Text style={styles.modalSubtitle}>Scroll to select</Text>
            </View>

            <View style={styles.pickersRow}>
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Month</Text>
                <WheelPicker
                  data={months}
                  selectedValue={formData.dobMonth}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dobMonth: value }))}
                  renderLabel={(item) => item.label.substring(0, 3)}
                />
              </View>

              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Day</Text>
                <WheelPicker
                  data={days}
                  selectedValue={formData.dobDay}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dobDay: value }))}
                  renderLabel={(item) => String(item)}
                />
              </View>

              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Year</Text>
                <WheelPicker
                  data={years}
                  selectedValue={formData.dobYear}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dobYear: value }))}
                  renderLabel={(item) => String(item)}
                />
              </View>
            </View>

            <View style={styles.agePreview}>
              <Text style={styles.agePreviewText}>
                You'll be <Text style={styles.agePreviewBold}>{calculateAge()} years old</Text>
              </Text>
            </View>

            <DuoButton
              title="Done"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                setShowDOBPicker(false);
              }}
              color={Colors.primary}
              style={{ marginTop: 16 }}
              size="large"
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 140,
  },
  stepPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  stepPillText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.white,
  },
  progressTrack: {
    marginTop: 8,
    marginBottom: 10,
    height: 8,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    overflow: 'hidden',
    marginHorizontal: 24,
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: Colors.primary,
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
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Field Cards
  fieldCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 16,
    borderBottomWidth: 5,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  fieldInput: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    paddingVertical: 2,
  },
  dobDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ageChip: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ageChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },

  // Gender Cards
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 20,
    borderBottomWidth: 5,
  },
  genderCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  genderEmoji: {
    fontSize: 32,
  },
  genderText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  genderTextActive: {
    color: Colors.primary,
  },

  // Measurements
  measurementRow: {
    flexDirection: 'row',
    gap: 12,
  },
  measurementCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderBottomWidth: 5,
  },
  measurementEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  measurementInput: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    minWidth: 60,
  },
  unitText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  funTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  funTipEmoji: {
    fontSize: 24,
  },
  funTipText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 20,
  },

  // Goals Grid
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  goalCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 5,
  },
  goalCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  goalEmoji: {
    fontSize: 32,
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
  },
  goalLabelActive: {
    color: Colors.primary,
  },
  goalDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Activity Cards
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderBottomWidth: 4,
  },
  activityCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  activityEmoji: {
    fontSize: 28,
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 2,
  },
  activityLabelActive: {
    color: Colors.primary,
  },
  activityDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Diet Grid
  dietGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  dietCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 5,
  },
  dietCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  dietEmoji: {
    fontSize: 32,
  },
  dietLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
  },
  dietLabelActive: {
    color: Colors.primary,
  },
  dietDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Final Tip
  finalTip: {
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    padding: 24,
    marginTop: 8,
  },
  finalTipEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  finalTipTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: 8,
  },
  finalTipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerColumn: {
    flex: 1,
    alignItems: 'center',
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  wheelContainer: {
    height: ITEM_HEIGHT * 5,
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    zIndex: -1,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelItemText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textLight,
  },
  wheelItemTextSelected: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.primary,
  },
  agePreview: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  agePreviewText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  agePreviewBold: {
    fontWeight: '900',
    color: Colors.primary,
  },
});
