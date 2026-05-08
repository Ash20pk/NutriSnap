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
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { userApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import AnimatedCard from '../components/AnimatedCard';
import DuoButton from '../components/DuoButton';

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

const TOTAL_STEPS = 6; // steps 1–6 (step 0 is the welcome screen)

export default function Onboarding() {
  const router = useRouter();
  const { setUser } = useUser();
  const [step, setStep] = useState(0); // 0 = welcome
  const [loading, setLoading] = useState(false);
  const [showDOBPicker, setShowDOBPicker] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

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
    food_allergies: [] as string[],
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
    { id: 'no_restriction', label: 'Flexible', emoji: '🍽️', desc: 'I eat it all' },
    { id: 'vegetarian', label: 'Vegetarian', emoji: '🥬', desc: 'No meat or fish' },
    { id: 'vegan', label: 'Vegan', emoji: '🌱', desc: 'Plant-based only' },
    { id: 'non_veg', label: 'Non-Veg', emoji: '🍖', desc: 'Meat & everything' },
    { id: 'jain', label: 'Jain', emoji: '🫘', desc: 'No root vegetables' },
    { id: 'keto', label: 'Keto', emoji: '🥑', desc: 'Low carb, high fat' },
    { id: 'paleo', label: 'Paleo', emoji: '🥩', desc: 'Whole & unprocessed' },
    { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒', desc: 'Heart-healthy' },
  ];

  const allergyOptions = [
    { id: 'gluten', label: 'Gluten', emoji: '🌾' },
    { id: 'dairy', label: 'Dairy', emoji: '🥛' },
    { id: 'eggs', label: 'Eggs', emoji: '🥚' },
    { id: 'nuts', label: 'Tree Nuts', emoji: '🥜' },
    { id: 'peanuts', label: 'Peanuts', emoji: '🫘' },
    { id: 'shellfish', label: 'Shellfish', emoji: '🦐' },
    { id: 'soy', label: 'Soy', emoji: '🟢' },
    { id: 'fish', label: 'Fish', emoji: '🐟' },
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

  const animateProgress = (toStep: number) => {
    Animated.timing(progressAnim, {
      toValue: toStep / TOTAL_STEPS,
      duration: 350,
      useNativeDriver: false,
    }).start();
  };

  const handleNext = () => {
    if (step === 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setStep(1);
      animateProgress(1);
      return;
    }
    if (step === 1 && !formData.name) {
      Alert.alert('Hey there!', "What's your name? We'd love to know!");
      return;
    }
    if (step === 2 && (!formData.height || !formData.weight)) {
      Alert.alert('Almost there!', 'We need your measurements to create your plan');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      animateProgress(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep(step - 1);
    animateProgress(step - 1);
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
        food_allergies: formData.food_allergies,
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
      case 1: return { title: "Let's get to know you", subtitle: 'Tell us a little about yourself' };
      case 2: return { title: 'Your body, your stats', subtitle: "We'll build your perfect daily targets" };
      case 3: return { title: "What's your goal?", subtitle: 'Pick the one that drives you' };
      case 4: return { title: 'How active are you?', subtitle: 'Be honest — we\'ll calibrate for you' };
      case 5: return { title: 'Your food style', subtitle: "We'll personalize your suggestions" };
      case 6: return { title: 'Any food allergies?', subtitle: 'Select all that apply — or skip if none' };
      default: return { title: '', subtitle: '' };
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
  }, [formData.dobMonth, formData.dobYear, formData.dobDay, daysInSelectedMonth]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.screen}>

        {/* ── Welcome screen ── */}
        {step === 0 && (
          <View style={styles.welcomeContainer}>
            <AnimatedCard type="pop" delay={0}>
              <View style={styles.welcomeInner}>
                <Text style={styles.welcomeEmoji}>🥗</Text>
                <Text style={styles.welcomeTitle}>Welcome to Loggr</Text>
                <Text style={styles.welcomeSubtitle}>
                  {'Your personal nutrition companion.\nLet\'s set up your profile in under a minute.'}
                </Text>

                <View style={styles.welcomeFeatures}>
                  {[
                    { emoji: '🎯', text: 'Personalised calorie & macro targets' },
                    { emoji: '📸', text: 'AI-powered meal logging with your camera' },
                    { emoji: '📈', text: 'Track progress and build streaks' },
                  ].map((f) => (
                    <View key={f.text} style={styles.welcomeFeatureRow}>
                      <Text style={styles.welcomeFeatureEmoji}>{f.emoji}</Text>
                      <Text style={styles.welcomeFeatureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>

                <DuoButton
                  title="Let's get started →"
                  onPress={handleNext}
                  color={Colors.primary}
                  size="large"
                  style={{ marginTop: 32, width: '100%' }}
                />
              </View>
            </AnimatedCard>
          </View>
        )}

        {/* ── Steps 1–5 ── */}
        {step > 0 && (
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <TouchableOpacity
                  style={styles.backIconBtn}
                  onPress={handleBack}
                  disabled={loading}
                >
                  <Ionicons name="arrow-back" size={22} color={Colors.text} />
                </TouchableOpacity>

                <View style={styles.dotsRow}>
                  {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i < step ? styles.dotActive : i === step - 1 ? styles.dotCurrent : styles.dotInactive,
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.stepPill}>
                  <Text style={styles.stepPillText}>{step}/{TOTAL_STEPS}</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
              </View>

              <View style={styles.stepTitleBlock}>
                <Text style={styles.stepTitle}>{stepMeta.title}</Text>
                <Text style={styles.stepSubtitle}>{stepMeta.subtitle}</Text>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1 — Name, DOB, Gender */}
              {step === 1 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
                  <View style={styles.fieldCard}>
                    <Text style={styles.fieldLabel}>WHAT SHOULD WE CALL YOU?</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Your name"
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
                    <Text style={styles.fieldLabel}>DATE OF BIRTH</Text>
                    <View style={styles.dobDisplayRow}>
                      <Text style={styles.fieldInput}>{formatDOB()}</Text>
                      <View style={styles.ageChip}>
                        <Text style={styles.ageChipText}>{calculateAge()} yrs</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <Text style={styles.sectionLabel}>I identify as</Text>
                  <View style={styles.genderContainer}>
                    {[
                      { id: 'male', emoji: '👨', label: 'Male' },
                      { id: 'female', emoji: '👩', label: 'Female' },
                    ].map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.genderCard, formData.gender === g.id && styles.genderCardActive]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setFormData({ ...formData, gender: g.id });
                        }}
                      >
                        <Text style={styles.genderEmoji}>{g.emoji}</Text>
                        <Text style={[styles.genderText, formData.gender === g.id && styles.genderTextActive]}>
                          {g.label}
                        </Text>
                        {formData.gender === g.id && (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </AnimatedCard>
              )}

              {/* Step 2 — Height & Weight */}
              {step === 2 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
                  <View style={styles.measurementRow}>
                    <View style={[styles.measurementCard, { flex: 1 }]}>
                      <Text style={styles.measurementEmoji}>📏</Text>
                      <Text style={styles.fieldLabel}>HEIGHT</Text>
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
                      <Text style={styles.fieldLabel}>WEIGHT</Text>
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
                    <Ionicons name="refresh-circle-outline" size={28} color={Colors.primary} />
                    <Text style={styles.funTipText}>
                      {'We\'ll remind you monthly to update your weight so targets stay accurate.'}
                    </Text>
                  </View>
                </AnimatedCard>
              )}

              {/* Step 3 — Goal */}
              {step === 3 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
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
                        {formData.goal === goal.id && (
                          <View style={styles.goalCheck}>
                            <Ionicons name="checkmark" size={14} color={Colors.white} />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </AnimatedCard>
              )}

              {/* Step 4 — Activity Level */}
              {step === 4 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
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
                        <Text style={[styles.activityLabel, formData.activity_level === level.id && styles.activityLabelActive]}>
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

              {/* Step 5 — Dietary style */}
              {step === 5 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
                  <View style={styles.dietGrid}>
                    {dietaryPreferences.map((pref) => (
                      <TouchableOpacity
                        key={pref.id}
                        style={[styles.dietCard, formData.dietary_preference === pref.id && styles.dietCardActive]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setFormData({ ...formData, dietary_preference: pref.id });
                        }}
                      >
                        <Text style={styles.dietEmoji}>{pref.emoji}</Text>
                        <Text style={[styles.dietLabel, formData.dietary_preference === pref.id && styles.dietLabelActive]}>
                          {pref.label}
                        </Text>
                        <Text style={styles.dietDesc}>{pref.desc}</Text>
                        {formData.dietary_preference === pref.id && (
                          <View style={styles.goalCheck}>
                            <Ionicons name="checkmark" size={14} color={Colors.white} />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </AnimatedCard>
              )}

              {/* Step 6 — Food allergies + Finish */}
              {step === 6 && (
                <AnimatedCard type="pop" delay={80} style={styles.stepContainer}>
                  <View style={styles.allergyGrid}>
                    {allergyOptions.map((item) => {
                      const selected = formData.food_allergies.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.allergyCard, selected && styles.allergyCardActive]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            const next = selected
                              ? formData.food_allergies.filter((a) => a !== item.id)
                              : [...formData.food_allergies, item.id];
                            setFormData({ ...formData, food_allergies: next });
                          }}
                        >
                          <Text style={styles.allergyEmoji}>{item.emoji}</Text>
                          <Text style={[styles.allergyLabel, selected && styles.allergyLabelActive]}>
                            {item.label}
                          </Text>
                          {selected && (
                            <View style={styles.allergyCheck}>
                              <Ionicons name="checkmark" size={12} color={Colors.white} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={styles.noAllergyBtn}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFormData({ ...formData, food_allergies: [] });
                    }}
                  >
                    <Ionicons
                      name={formData.food_allergies.length === 0 ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={formData.food_allergies.length === 0 ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[
                      styles.noAllergyText,
                      formData.food_allergies.length === 0 && styles.noAllergyTextActive,
                    ]}>
                      None — I have no allergies
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.finalTip}>
                    <Text style={styles.finalTipEmoji}>🎉</Text>
                    <Text style={styles.finalTipTitle}>{"You're all set!"}</Text>
                    <Text style={styles.finalTipText}>
                      {'Tap Finish and let\'s start your health journey!'}
                    </Text>
                  </View>
                </AnimatedCard>
              )}
            </ScrollView>

            <View style={styles.bottomBar}>
              <DuoButton
                title="Back"
                onPress={handleBack}
                disabled={loading}
                color={Colors.white}
                shadowColor={Colors.border}
                textStyle={{ color: Colors.primary }}
                style={{ flex: 1 }}
                size="medium"
              />
              <DuoButton
                title={step === TOTAL_STEPS ? 'Finish 🎉' : 'Continue'}
                onPress={handleNext}
                disabled={loading}
                loading={loading}
                color={Colors.primary}
                style={{ flex: 2 }}
                size="medium"
              />
            </View>
          </>
        )}
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
              <Text style={styles.modalTitle}>{"When's your birthday?"}</Text>
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
                {"You'll be "}<Text style={styles.agePreviewBold}>{calculateAge()} years old</Text>
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

  // ── Welcome ──────────────────────────────────────
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  welcomeInner: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 8,
  },
  welcomeEmoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  welcomeFeatures: {
    width: '100%',
    gap: 14,
  },
  welcomeFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  welcomeFeatureEmoji: {
    fontSize: 22,
  },
  welcomeFeatureText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },

  // ── Step header ──────────────────────────────────
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.primary,
  },
  dotCurrent: {
    width: 20,
    backgroundColor: Colors.primary,
  },
  dotInactive: {
    width: 8,
    backgroundColor: Colors.border,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: {
    height: '100%',
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  stepTitleBlock: {
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  stepSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 140,
  },
  stepContainer: {
    marginTop: 4,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.textSecondary,
    marginBottom: 12,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  goalCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: '47%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 5,
    borderBottomWidth: 4,
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

  // Allergy Grid
  allergyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  allergyCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 4,
    position: 'relative',
  },
  allergyCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  allergyEmoji: {
    fontSize: 22,
  },
  allergyLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  allergyLabelActive: {
    color: Colors.primary,
  },
  allergyCheck: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noAllergyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 16,
    borderBottomWidth: 4,
  },
  noAllergyText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  noAllergyTextActive: {
    color: Colors.primary,
    fontWeight: '900',
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
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1.5,
    borderTopColor: Colors.borderLight,
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
