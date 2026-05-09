import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import { mealApi, Meal } from '../utils/api';
import * as Haptics from 'expo-haptics';

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny-outline' },
  { id: 'lunch',     label: 'Lunch',     icon: 'partly-sunny-outline' },
  { id: 'dinner',    label: 'Dinner',    icon: 'moon-outline' },
  { id: 'snack',     label: 'Snack',     icon: 'cafe-outline' },
] as const;

interface Props {
  meal: Meal | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: (meal: Meal) => void;
  onDeleted: (mealId: string) => void;
}

export default function MealActionsSheet({ meal, visible, onClose, onUpdated, onDeleted }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [tab, setTab] = useState<'view' | 'edit'>('view');
  const [mealType, setMealType] = useState(meal?.meal_type ?? 'breakfast');
  const [foods, setFoods] = useState<any[]>(meal?.foods ?? []);
  const [notes, setNotes] = useState(meal?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync local state when the meal prop changes
  useEffect(() => {
    if (meal) {
      setMealType(meal.meal_type);
      setFoods(meal.foods ? [...meal.foods] : []);
      setNotes(meal.notes ?? '');
      setTab('view');
    }
  }, [meal]);

  if (!meal) return null;

  const totalCals = foods.reduce((s, f) => s + (f.calories ?? 0), 0);

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'Delete Meal',
      'This meal will be permanently removed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await mealApi.deleteMeal(meal.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onDeleted(meal.id);
              onClose();
            } catch {
              Alert.alert('Error', 'Could not delete meal. Please try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await mealApi.updateMeal(meal.id, {
        meal_type: mealType,
        foods,
        notes: notes.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onUpdated(updated);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not update meal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeFood = async (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const newFoods = foods.filter((_, i) => i !== index);
    setFoods(newFoods);
    
    // If in view mode, auto-save or delete
    if (tab === 'view') {
      if (newFoods.length === 0) {
        await mealApi.deleteMeal(meal.id);
        onDeleted(meal.id);
        onClose();
      } else {
        const updated = await mealApi.updateMeal(meal.id, {
          meal_type: mealType,
          foods: newFoods,
          notes,
        });
        onUpdated(updated);
      }
    }
  };

  const updateQuantity = (index: number, raw: string) => {
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) return;
    setFoods(f =>
      f.map((item, i) => {
        if (i !== index) return item;
        const ratio = val / (item.quantity || 100);
        return {
          ...item,
          quantity: val,
          calories: item.calories_per_100g ? item.calories_per_100g * (val / 100) : item.calories * ratio,
          protein:  item.protein_per_100g  ? item.protein_per_100g  * (val / 100) : item.protein  * ratio,
          carbs:    item.carbs_per_100g    ? item.carbs_per_100g    * (val / 100) : item.carbs    * ratio,
          fat:      item.fat_per_100g      ? item.fat_per_100g      * (val / 100) : item.fat      * ratio,
        };
      })
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableOpacity>

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                {MEAL_TYPES.find(t => t.id === meal.meal_type)?.label ?? meal.meal_type}
              </Text>
              <Text style={styles.headerSub}>
                {(+meal.total_calories).toFixed(1)} kcal · {meal.foods?.length ?? 0} items
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={handleDelete} style={styles.closeBtn}>
                {deleting ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabRow}>
            {(['view', 'edit'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && styles.tabActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                  {t === 'view' ? 'Details' : 'Edit'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {tab === 'view' ? (
              /* ── View mode ── */
              <>
                {meal.foods?.map((food, i) => (
                  <View key={i} style={styles.editFoodRow}>
                    <View style={[styles.foodDot, { marginTop: 6, alignSelf: 'flex-start' }]} />
                    <View style={styles.editFoodInfo}>
                      <Text style={styles.foodName} numberOfLines={1}>{food.name}</Text>
                      <Text style={[styles.foodMeta, { marginTop: 4 }]}>
                        {(+(food.quantity ?? 0)).toFixed(1)}g · {(+(food.calories ?? 0)).toFixed(1)} kcal · P {(+(food.protein ?? 0)).toFixed(1)}g
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFood(i)} style={styles.removeBtn}>
                      <Ionicons name="trash-outline" size={18} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {meal.notes ? (
                  <View style={styles.notesBox}>
                    <Ionicons name="document-text-outline" size={14} color={theme.textSecondary} />
                    <Text style={styles.notesText}>{meal.notes}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              /* ── Edit mode ── */
              <>
                {/* Meal type */}
                <Text style={styles.fieldLabel}>Meal Type</Text>
                <View style={styles.typeRow}>
                  {MEAL_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeChip, mealType === t.id && styles.typeChipActive]}
                      onPress={() => setMealType(t.id)}
                    >
                      <Ionicons
                        name={t.icon as any}
                        size={16}
                        color={mealType === t.id ? theme.white : theme.textSecondary}
                      />
                      <Text style={[styles.typeLabel, mealType === t.id && styles.typeLabelActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Foods */}
                <Text style={styles.fieldLabel}>Foods · {totalCals.toFixed(1)} kcal</Text>
                {foods.map((food, i) => (
                  <View key={i} style={styles.editFoodRow}>
                    <View style={styles.editFoodInfo}>
                      <Text style={styles.foodName} numberOfLines={1}>{food.name}</Text>
                      <View style={styles.quantityRow}>
                        <TextInput
                          style={styles.quantityInput}
                          keyboardType="numeric"
                          defaultValue={String(Math.round(food.quantity ?? 0))}
                          onEndEditing={e => updateQuantity(i, e.nativeEvent.text)}
                          selectTextOnFocus
                        />
                        <Text style={styles.quantityUnit}>g</Text>
                        <Text style={styles.foodMeta}>  {(+(food.calories ?? 0)).toFixed(1)} kcal</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeFood(i)} style={styles.removeBtn}>
                      <Ionicons name="trash-outline" size={18} color={theme.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                {foods.length === 0 && (
                  <Text style={styles.emptyFoods}>No foods — saving will clear this meal.</Text>
                )}

                {/* Notes */}
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  placeholder="Add a note…"
                  placeholderTextColor={theme.textLight}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={200}
                />
              </>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Action buttons */}
          {tab === 'edit' && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color={theme.white} />
                  : <Text style={styles.saveBtnLabel}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: theme.white,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '90%',
      flexShrink: 1,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
      textTransform: 'capitalize',
    },
    headerSub: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 12,
      padding: 3,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: theme.white,
      shadowColor: theme.shadow,
      shadowOpacity: 0.15,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    tabLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    tabLabelActive: {
      color: theme.text,
    },
    body: {
      paddingHorizontal: 20,
    },
    foodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderLight,
      gap: 10,
    },
    foodDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.primary,
    },
    foodInfo: { flex: 1 },
    foodName: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    foodMeta: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 1,
    },
    foodMacros: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    notesBox: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'flex-start',
      marginTop: 14,
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 10,
      padding: 12,
    },
    notesText: {
      flex: 1,
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 16,
      marginBottom: 8,
    },
    typeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.white,
    },
    typeChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    typeLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    typeLabelActive: { color: theme.white },
    editFoodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderLight,
      gap: 10,
    },
    editFoodInfo: { flex: 1 },
    quantityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    quantityInput: {
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      width: 64,
      textAlign: 'center',
    },
    quantityUnit: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    removeBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: 'rgba(211,47,47,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyFoods: {
      fontSize: 13,
      color: theme.textLight,
      textAlign: 'center',
      paddingVertical: 16,
    },
    notesInput: {
      borderWidth: 1.5,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      fontSize: 14,
      color: theme.text,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'rgba(211,47,47,0.3)',
      backgroundColor: 'rgba(211,47,47,0.06)',
    },
    deleteBtnLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.error,
    },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: theme.primary,
      borderWidth: 2,
      borderColor: theme.primaryDark,
      borderBottomWidth: 4,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnLabel: {
      fontSize: 15,
      fontWeight: '900',
      color: theme.white,
    },
  });
}
