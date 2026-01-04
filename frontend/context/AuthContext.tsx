import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { AuthChangeEvent, Provider, Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

WebBrowser.maybeCompleteAuthSession();

// AppState listener for auto-refresh (from official Supabase tutorial)
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

type AuthContextType = {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session (from official tutorial pattern)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes (from official tutorial pattern)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      console.log('[Auth] Auth state changed:', _event);
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  };

  const signUpEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const redirectTo = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  };

  const signInOAuth = async (provider: Provider) => {
    const redirectTo = Linking.createURL('auth-callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Missing OAuth URL');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      throw new Error('OAuth cancelled');
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (exchangeError) throw exchangeError;

    // Wait briefly and refresh session to ensure it's fully established
    await new Promise((resolve) => setTimeout(resolve, 100));
    await supabase.auth.getSession();
  };

  const signInGoogle = async () => {
    await signInOAuth('google');
  };

  const signInApple = async () => {
    await signInOAuth('apple');
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      accessToken: session?.access_token ?? null,
      isLoading,
      signInEmail,
      signUpEmail,
      resetPassword,
      signInGoogle,
      signInApple,
      logout,
    }),
    [user, session?.access_token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
