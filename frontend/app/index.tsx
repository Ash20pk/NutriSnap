import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { Colors } from '../constants/Colors';
import { userApi } from '../utils/api';
import DuoButton from '../components/DuoButton';

export default function Index() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, logout: authLogout } = useAuth();
  const { user, setUser, isLoading, logout: userLogout } = useUser();
  const [profileCheckLoading, setProfileCheckLoading] = useState(false);
  const [profileFetchAttempted, setProfileFetchAttempted] = useState(false);
  const [profileFetchError, setProfileFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || isLoading) return;

    if (!authUser) {
      router.replace('/intro' as any);
      return;
    }

    if (!user && !profileCheckLoading) {
      if (profileFetchAttempted) return;
      setProfileCheckLoading(true);
      setProfileFetchAttempted(true);
      userApi
        .getMe()
        .then(async (profile) => {
          await setUser(profile);
        })
        .catch((err: any) => {
          // If user doesn't exist yet, onboarding will create it.
          const status = err?.response?.status;
          if (status === 404) {
            router.replace('/onboarding');
            return;
          }

          // Network/backend error: avoid infinite retry loop and show retry UI.
          setProfileFetchError('Unable to reach the server. Please check your connection and try again.');
        })
        .finally(() => {
          setProfileCheckLoading(false);
        });
      return;
    }

    if (profileCheckLoading) return;

    if (user && user.onboarding_completed) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/onboarding');
    }
  }, [
    authUser,
    authLoading,
    user,
    isLoading,
    profileCheckLoading,
    profileFetchAttempted,
    router,
    setUser,
  ]);

  if (profileFetchError) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Can’t connect</Text>
          <Text style={styles.errorText}>{profileFetchError}</Text>
          <View style={styles.errorActions}>
            <DuoButton
              title="Retry"
              onPress={() => {
                setProfileFetchError(null);
                setProfileFetchAttempted(false);
              }}
              color={Colors.primary}
              size="medium"
              style={{ flex: 1 }}
            />

            <DuoButton
              title="Sign out"
              onPress={async () => {
                try {
                  await authLogout();
                } finally {
                  userLogout();
                  router.replace('/intro' as any);
                }
              }}
              color={Colors.white}
              shadowColor={Colors.border}
              textStyle={{ color: Colors.text }}
              size="medium"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 10,
    alignItems: 'center',
    width: '100%',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    fontWeight: '700',
    marginBottom: 20,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
});