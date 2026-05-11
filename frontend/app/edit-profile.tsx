import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import PageHeader from '../components/PageHeader';
import DuoButton from '../components/DuoButton';
import { useRouter } from 'expo-router';
import { userApi, socialApi } from '../utils/api';
import { supabase } from '../utils/supabase';

export default function EditProfileScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const { user, setUser } = useUser();

  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const dicebearAvatarUrl = React.useMemo(() => {
    if (!user?.id) return null;
    const seed = encodeURIComponent((user.username || user.name || user.id || 'U').trim());
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}`;
  }, [user?.id, user?.name, user?.username]);

  const resolvedAvatarUrl = user?.avatar_url || dicebearAvatarUrl;

  const [editUsernameDraft, setEditUsernameDraft] = useState('');
  const [editNameDraft, setEditNameDraft] = useState('');
  const [editBioDraft, setEditBioDraft] = useState('');
  const [editWeightDraft, setEditWeightDraft] = useState('');
  const [editHeightDraft, setEditHeightDraft] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const dobMonthRef = useRef<TextInput>(null);
  const dobYearRef = useRef<TextInput>(null);

  useEffect(() => {
    setEditUsernameDraft((user?.username || '').toString());
    setEditNameDraft((user?.name || '').toString());
    setEditBioDraft((user?.bio || '').toString());
    setEditWeightDraft(user?.weight ? String(user.weight) : '');
    setEditHeightDraft(user?.height ? String(user.height) : '');
    if (user?.date_of_birth) {
      const [y, m, d] = user.date_of_birth.split('-');
      setDobYear(y || '');
      setDobMonth(m || '');
      setDobDay(d || '');
    }
  }, [user?.username, user?.name, user?.bio, user?.weight, user?.height, user?.date_of_birth]);

  const computedBmi = useMemo(() => {
    const w = parseFloat(editWeightDraft);
    const h = parseFloat(editHeightDraft);
    if (!w || !h || h <= 0) return null;
    return Math.round((w / Math.pow(h / 100, 2)) * 10) / 10;
  }, [editWeightDraft, editHeightDraft]);

  const bmiCategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Underweight', color: '#3b82f6' };
    if (bmi < 25) return { label: 'Normal', color: '#22c55e' };
    if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
    return { label: 'Obese', color: '#ef4444' };
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const candidate = (editUsernameDraft || '').trim().toLowerCase();
    if (candidate && !/^[a-z0-9_]{3,20}$/.test(candidate)) {
      Alert.alert('Invalid username', 'Use 3-20 characters: letters, numbers, underscores.');
      return;
    }
    try {
      setSavingProfile(true);
      const weight = parseFloat(editWeightDraft);
      const height = parseFloat(editHeightDraft);

      // Build date_of_birth string if all DOB parts are filled and valid
      let date_of_birth: string | undefined;
      if (dobDay.trim() && dobMonth.trim() && dobYear.trim() && dobYear.trim().length === 4) {
        const d = dobDay.trim().padStart(2, '0');
        const m = dobMonth.trim().padStart(2, '0');
        const y = dobYear.trim();
        const parsed = new Date(`${y}-${m}-${d}`);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() === parseInt(y)) {
          date_of_birth = `${y}-${m}-${d}`;
        }
      }

      const updatePayload: any = {
        bio: editBioDraft.trim(),
        name: editNameDraft.trim(),
        ...(editWeightDraft.trim() && !isNaN(weight) ? { weight } : {}),
        ...(editHeightDraft.trim() && !isNaN(height) ? { height } : {}),
        ...(date_of_birth ? { date_of_birth } : {}),
      };

      const promises: Promise<any>[] = [userApi.updateMyProfile(updatePayload)];
      if (candidate && candidate !== user.username) {
        promises.push(socialApi.setMyUsername(candidate));
      }

      const results = await Promise.all(promises);
      const profileRes = results[0];
      const usernameRes = results.length > 1 ? results[1] : null;

      await setUser({
        ...user,
        username: usernameRes ? usernameRes.username : user.username,
        name: editNameDraft.trim(),
        bio: profileRes.bio ?? editBioDraft.trim(),
        weight: profileRes.weight ?? (editWeightDraft.trim() ? parseFloat(editWeightDraft) : user.weight),
        height: profileRes.height ?? (editHeightDraft.trim() ? parseFloat(editHeightDraft) : user.height),
        age: profileRes.age ?? user.age,
        date_of_birth: profileRes.date_of_birth ?? user.date_of_birth,
        daily_calorie_target: profileRes.daily_calorie_target ?? user.daily_calorie_target,
        protein_target: profileRes.protein_target ?? user.protein_target,
        carbs_target: profileRes.carbs_target ?? user.carbs_target,
        fat_target: profileRes.fat_target ?? user.fat_target,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 409) {
        Alert.alert('Username taken', 'That username is already taken. Try another.');
      } else {
        Alert.alert('Error', detail || 'Failed to save profile');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickPhoto = async () => {
    if (!user) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Allow Loggr to access your photos to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;

      setUploadingPhoto(true);
      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${user.id}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const updated = await userApi.updateMyProfile({ avatar_url: urlData.publicUrl });
      await setUser({ ...user, avatar_url: updated.avatar_url ?? urlData.publicUrl });
      setAvatarImageFailed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not update profile photo. Try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Edit Profile"
        showBack={true}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.modalAvatarSection}>
            <View style={styles.avatarEditContainer}>
              <View style={styles.avatarLarge}>
                {!avatarImageFailed && resolvedAvatarUrl ? (
                  <Image
                    source={{ uri: resolvedAvatarUrl }}
                    style={{ width: '100%', height: '100%', borderRadius: Radius.xxxxl }}
                    onError={() => setAvatarImageFailed(true)}
                  />
                ) : (
                  <Text style={styles.avatarTextLarge}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.avatarEditBadge}
                onPress={handlePickPhoto}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color={theme.white} />
                  : <Ionicons name="camera" size={18} color={theme.white} />}
              </TouchableOpacity>
            </View>
            <Text style={styles.changePhotoHint}>Tap to change photo</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={theme.primary} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.textInput}
                value={editNameDraft}
                onChangeText={setEditNameDraft}
                placeholder="Your name"
                placeholderTextColor={theme.textLight}
                selectionColor={theme.primary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputPrefix}>@</Text>
              <TextInput
                style={styles.textInput}
                value={editUsernameDraft}
                onChangeText={(t) => setEditUsernameDraft(t.toLowerCase().replace(/\s/g, ''))}
                placeholder="your_username"
                placeholderTextColor={theme.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                selectionColor={theme.primary}
              />
            </View>
            <Text style={styles.inputHint}>3-20 characters (letters, numbers, underscores)</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bio</Text>
            <View style={[styles.inputWrapper, styles.bioInputWrapper]}>
              <TextInput
                style={[styles.textInput, styles.bioTextInput]}
                value={editBioDraft}
                onChangeText={setEditBioDraft}
                placeholder="Tell us about your fitness journey..."
                placeholderTextColor={theme.textLight}
                multiline
                numberOfLines={4}
                maxLength={160}
                selectionColor={theme.primary}
              />
            </View>
            <Text style={styles.charCount}>{editBioDraft.length}/160</Text>
          </View>

          <Text style={styles.sectionDivider}>Body Stats</Text>

          <View style={styles.rowInputGroup}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Weight (kg)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="barbell-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={editWeightDraft}
                  onChangeText={setEditWeightDraft}
                  placeholder="e.g. 72"
                  placeholderTextColor={theme.textLight}
                  keyboardType="decimal-pad"
                  selectionColor={theme.primary}
                />
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Height (cm)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="resize-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={editHeightDraft}
                  onChangeText={setEditHeightDraft}
                  placeholder="e.g. 175"
                  placeholderTextColor={theme.textLight}
                  keyboardType="decimal-pad"
                  selectionColor={theme.primary}
                />
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Date of Birth</Text>
            <View style={[styles.inputWrapper, { paddingHorizontal: Spacing.md }]}>
              <Ionicons name="calendar-outline" size={18} color={theme.primary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.textInput, styles.dobField]}
                value={dobDay}
                onChangeText={(v) => {
                  setDobDay(v);
                  if (v.length === 2) dobMonthRef.current?.focus();
                }}
                placeholder="DD"
                placeholderTextColor={theme.textLight}
                keyboardType="number-pad"
                maxLength={2}
                selectionColor={theme.primary}
              />
              <Text style={styles.dobSep}>/</Text>
              <TextInput
                ref={dobMonthRef}
                style={[styles.textInput, styles.dobField]}
                value={dobMonth}
                onChangeText={(v) => {
                  setDobMonth(v);
                  if (v.length === 2) dobYearRef.current?.focus();
                }}
                placeholder="MM"
                placeholderTextColor={theme.textLight}
                keyboardType="number-pad"
                maxLength={2}
                selectionColor={theme.primary}
              />
              <Text style={styles.dobSep}>/</Text>
              <TextInput
                ref={dobYearRef}
                style={[styles.textInput, { flex: 1.5 }]}
                value={dobYear}
                onChangeText={setDobYear}
                placeholder="YYYY"
                placeholderTextColor={theme.textLight}
                keyboardType="number-pad"
                maxLength={4}
                selectionColor={theme.primary}
              />
            </View>
          </View>

          {computedBmi !== null && (
            <View style={[styles.bmiCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bmiLabel}>Body Mass Index</Text>
                <Text style={[styles.bmiCategory, { color: bmiCategory(computedBmi).color }]}>
                  {bmiCategory(computedBmi).label}
                </Text>
              </View>
              <Text style={[styles.bmiValue, { color: bmiCategory(computedBmi).color }]}>
                {computedBmi}
              </Text>
            </View>
          )}

          <DuoButton
            title={savingProfile ? 'Saving...' : 'Save Changes'}
            onPress={handleSaveProfile}
            disabled={savingProfile}
            loading={savingProfile}
            color={theme.primary}
            size="large"
            style={{ marginTop: Spacing.sm }}
          />
          <View style={{ height: Platform.OS === 'ios' ? 80 : 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.primary,
      paddingHorizontal: 8,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.xl,
    },
    modalAvatarSection: {
      alignItems: 'center',
      marginBottom: Spacing.xxl,
    },
    avatarEditContainer: {
      position: 'relative',
      marginBottom: Spacing.sm,
    },
    avatarLarge: {
      width: 100,
      height: 100,
      borderRadius: Radius.xxxxl,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: theme.border,
      borderBottomWidth: Spacing.sm + 2,
      overflow: 'hidden',
    },
    avatarTextLarge: {
      fontSize: 40,
      fontWeight: '900',
      color: theme.text,
    },
    avatarEditBadge: {
      position: 'absolute',
      right: -4,
      bottom: 4,
      backgroundColor: theme.primary,
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 4,
      borderColor: theme.white,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    changePhotoHint: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.primary,
      marginTop: 8,
    },
    inputGroup: {
      marginBottom: Spacing.xxl,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      marginBottom: Spacing.xs + 2,
      marginLeft: 4,
      letterSpacing: 1,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.border,
      paddingHorizontal: Spacing.lg,
    },
    inputPrefix: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.primary,
      marginRight: Spacing.xs,
    },
    textInput: {
      flex: 1,
      height: 52,
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    inputHint: {
      fontSize: 12,
      color: theme.textLight,
      marginTop: 6,
      marginLeft: 4,
      fontWeight: '600',
    },
    bioInputWrapper: {
      alignItems: 'flex-start',
      paddingTop: Spacing.md,
      paddingBottom: Spacing.md,
    },
    bioTextInput: {
      height: 100,
      textAlignVertical: 'top',
      paddingTop: 0,
    },
    charCount: {
      fontSize: 12,
      color: theme.textSecondary,
      textAlign: 'right',
      marginTop: Spacing.xs,
      fontWeight: '700',
    },
    sectionDivider: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: Spacing.xl,
      marginTop: Spacing.sm,
    },
    rowInputGroup: {
      flexDirection: 'row',
      gap: Spacing.lg,
    },
    dobField: {
      flex: 1,
      textAlign: 'center',
    },
    dobSep: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.textSecondary,
      marginHorizontal: 4,
    },
    bmiCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: 2,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      marginBottom: Spacing.xxl,
    },
    bmiLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    bmiCategory: {
      fontSize: 15,
      fontWeight: '800',
      marginTop: 2,
    },
    bmiValue: {
      fontSize: 32,
      fontWeight: '900',
    },
  });
}
