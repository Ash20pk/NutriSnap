import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';
import { fontStyles } from '../constants/Fonts';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../components/PageHeader';
import AnimatedCard from '../components/AnimatedCard';

import DuoButton from '../components/DuoButton';

export default function AuthScreen() {
  const router = useRouter();
  const { isLoading, signInEmail, signUpEmail, resetPassword, signInGoogle, signInApple } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);


  const canUseApple = useMemo(() => Platform.OS === 'ios', []);

  const handleEmail = async () => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Invalid', 'Enter a valid email and a password of at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signInEmail(email, password);
      } else {
        await signUpEmail(email, password);
      }
      router.replace(mode === 'signup' ? '/onboarding' : '/');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      await signInGoogle();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Google sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApple = async () => {
    setSubmitting(true);
    try {
      await signInApple();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Apple sign-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Alert.alert('Enter your email', 'Please enter your email address first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSubmitting(true);
    try {
      await resetPassword(email);
      Alert.alert('Check your email', 'We sent you a password reset link.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send reset email');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={[Colors.background, Colors.backgroundSecondary]} style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.screen}>
          <View style={styles.headerWrap}>
            <PageHeader
              title={mode === 'signin' ? "Let's sign you in" : 'Create Account'}
              subtitle={
                mode === 'signin'
                  ? 'Sign in and elevate your nutrition game.'
                  : 'Sign up and take the first step towards your goals.'
              }
            />
          </View>

          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <AnimatedCard type="pop" delay={100} style={styles.modalWrap}>
              <View style={styles.card}>
              <View style={styles.inputWrap}>
                <Ionicons name="mail" size={18} color={Colors.textLight} />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed" size={18} color={Colors.textLight} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowPassword((v) => !v);
                  }}
                  disabled={submitting || isLoading}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={Colors.textLight} />
                </TouchableOpacity>
              </View>

              {mode === 'signin' && (
                <TouchableOpacity
                  style={styles.forgotRow}
                  onPress={handleForgotPassword}
                  disabled={submitting || isLoading}
                >
                  <Text style={styles.forgotText}>Forgot password</Text>
                </TouchableOpacity>
              )}

              {mode === 'signup' && (
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setAcceptedTerms((v) => !v);
                  }}
                  disabled={submitting || isLoading}
                >
                  <Ionicons
                    name={acceptedTerms ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={acceptedTerms ? Colors.primary : Colors.textLight}
                  />
                  <Text style={styles.termsText}>I have read and agree to the terms of privacy policy</Text>
                </TouchableOpacity>
              )}

              <DuoButton
                title={mode === 'signin' ? 'Sign in' : 'Sign up'}
                onPress={handleEmail}
                disabled={submitting || isLoading || (mode === 'signup' && !acceptedTerms)}
                loading={submitting || isLoading}
                color={Colors.primary}
                size="large"
                style={{ marginTop: 12 }}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              {canUseApple && (
                <DuoButton
                  title="Continue with Apple"
                  onPress={handleApple}
                  disabled={submitting || isLoading}
                  color={Colors.white}
                  shadowColor={Colors.border}
                  textStyle={{ color: Colors.text }}
                  size="medium"
                />
              )}

              <DuoButton
                title="Continue with Google"
                onPress={handleGoogle}
                disabled={submitting || isLoading}
                color={Colors.white}
                shadowColor={Colors.border}
                textStyle={{ color: Colors.text }}
                size="medium"
              />

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>
                  {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
                  }}
                  disabled={submitting || isLoading}
                >
                  <Text style={styles.footerLink}>{mode === 'signin' ? ' Sign up' : ' Sign in'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedCard>

          </ScrollView>

          <View style={styles.bottomBrand}>
            <View style={styles.logoMark}>
              <Ionicons name="leaf" size={22} color={Colors.white} />
            </View>
            <Text style={styles.brand}>NutriSnap</Text>
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
    paddingHorizontal: 20,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 120,
    justifyContent: 'center',
  },
  modalWrap: {
    alignItems: 'center',
    width: '100%',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    width: '100%',
    maxWidth: 420,
    borderBottomWidth: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  input: {
    flex: 1,
    color: Colors.text,
    paddingVertical: 0,
    fontSize: 16,
    fontWeight: '700',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  termsText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  footerLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  bottomBrand: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    opacity: 0.95,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  brand: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
