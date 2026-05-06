import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
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
  // signInApple: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle deep link when app is opened via OAuth redirect
  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (url) {
      const { params } = QueryParams.getQueryParams(url);
      if (params?.access_token) {
        supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
      }
    }
  }, [url]);

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
      if (__DEV__) console.log('[Auth] Auth state changed:', _event);
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const redirectTo = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
  }, []);

  const createSessionFromUrl = useCallback(async (url: string) => {
    const { params, errorCode } = QueryParams.getQueryParams(url);
    if (errorCode) throw new Error(errorCode);
    const { access_token, refresh_token } = params;
    if (!access_token) return;
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
  }, []);

  const signInOAuth = useCallback(async (provider: Provider) => {
    const redirectTo = makeRedirectUri();
    if (__DEV__) console.log('[OAuth] redirectTo:', redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('Missing OAuth URL');

    const result = await WebBrowser.openAuthSessionAsync(data?.url ?? '', redirectTo);
    if (__DEV__) console.log('[OAuth] result:', result.type, 'url' in result ? result.url : '');

    if (result.type === 'success') {
      await createSessionFromUrl(result.url);
    }
  }, [createSessionFromUrl]);

  const signInGoogle = useCallback(async () => {
    await signInOAuth('google');
  }, [signInOAuth]);

  // const signInApple = async () => {
  //   await signInOAuth('apple');
  // };

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      accessToken: session?.access_token ?? null,
      isLoading,
      signInEmail,
      signUpEmail,
      resetPassword,
      signInGoogle,
      // signInApple,
      logout,
    }),
    [user, session?.access_token, isLoading, signInEmail, signUpEmail, resetPassword, signInGoogle, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
