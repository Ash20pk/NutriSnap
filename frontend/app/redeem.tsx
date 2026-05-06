import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { useUser } from '../context/UserContext';
import { userApi } from '../utils/api';
import DuoButton from '../components/DuoButton';

export default function RedeemScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { user, setUser } = useUser();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoading(true);
    try {
      const result = await userApi.redeemCode(code.trim());
      await setUser(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (result.special_user_unlocked) {
        Alert.alert(
          '✨ Special Access Unlocked',
          'Welcome, Aayu 🌸 Your special theme has been activated.',
          [{ text: 'Yay!', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Code Redeemed!', 'Your promo code has been applied.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ?? e?.message ?? 'Something went wrong.';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Invalid Code', msg);
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(theme);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={theme.text} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="gift-outline" size={56} color={theme.primary} />
        </View>

        <Text style={styles.title}>Enter a Code</Text>
        <Text style={styles.subtitle}>
          Have a promo or special access code? Enter it below.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your secret code"
          placeholderTextColor={theme.textLight}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleRedeem}
        />

        <DuoButton
          title="Redeem"
          onPress={handleRedeem}
          loading={loading}
          disabled={!code.trim() || loading}
          color={theme.primary}
          size="large"
          style={styles.button}
        />

        {user?.is_special_user && (
          <View style={styles.activeBadge}>
            <Ionicons name="sparkles" size={14} color={theme.primary} />
            <Text style={[styles.activeBadgeText, { color: theme.primary }]}>
              Special access is active
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: ReturnType<typeof import('../context/ThemeContext').useTheme>['theme']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    backButton: {
      padding: 16,
      paddingTop: 56,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 24,
    },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 22,
    },
    input: {
      width: '100%',
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 20,
      paddingVertical: 16,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 4,
      color: theme.text,
      backgroundColor: theme.cardBackground,
      textAlign: 'center',
      marginBottom: 20,
    },
    button: {
      width: '100%',
    },
    activeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.backgroundSecondary,
    },
    activeBadgeText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
