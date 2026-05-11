import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import XpPopUp from '../components/XpPopUp';
import { ThemeProvider } from './ThemeContext';
import { userApi } from '../utils/api';

interface XpState {
  showPopup: boolean;
  amount: number;
}

interface UserProfile {
  id: string;
  username?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  name: string;
  age: number;
  gender: string;
  height: number;
  weight: number;
  goal: string;
  activity_level: string;
  dietary_preference: string;
  daily_calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  onboarding_completed: boolean;
  is_special_user?: boolean;
  date_of_birth?: string;
}

interface UserContextType {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  logout: () => void;
  isLoading: boolean;
  // XP management
  showXpPopup: (amount: number) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: authUser, isLoading: authLoading } = useAuth();
  const [xpState, setXpState] = useState<XpState>({ showPopup: false, amount: 0 });

  const showXpPopup = useCallback((amount: number) => {
    setXpState({ showPopup: true, amount });
  }, []);

  const dismissXpPopup = useCallback(() => {
    setXpState({ showPopup: false, amount: 0 });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        if (!authUser) {
          if (__DEV__) console.log('[UserContext] No auth user, clearing profile');
          await AsyncStorage.removeItem('user_profile');
          setUserState(null);
          setIsLoading(false);
          return;
        }

        // Load cached profile immediately so the UI is responsive
        const userData = await AsyncStorage.getItem('user_profile');
        if (userData) {
          if (__DEV__) console.log('[UserContext] Found cached profile');
          setUserState(JSON.parse(userData));
        }

        // Reconcile with backend in the background to pick up any server-side changes
        // (recalculated targets, goal updates, weight check flags, etc.)
        try {
          const fresh = await userApi.getMe();
          if (fresh) {
            await AsyncStorage.setItem('user_profile', JSON.stringify(fresh));
            setUserState(fresh as any);
            if (__DEV__) console.log('[UserContext] Profile reconciled with backend');
          }
        } catch (err) {
          // Non-fatal: cached profile is good enough if backend is unreachable
          if (__DEV__) console.log('[UserContext] Backend reconcile failed, using cache', err);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('[UserContext] Error loading user:', error);
        setIsLoading(false);
      }
    })();
  }, [authLoading, authUser, authUser?.id]);

  const setUser = async (newUser: UserProfile | null) => {
    try {
      if (newUser) {
        await AsyncStorage.setItem('user_profile', JSON.stringify(newUser));
        setUserState(newUser);
      } else {
        await AsyncStorage.removeItem('user_profile');
        setUserState(null);
      }
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('user_profile');
      setUserState(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout, isLoading, showXpPopup }}>
      <ThemeProvider isSpecialUser={user?.is_special_user ?? false}>
        {children}
        {xpState.showPopup && (
          <XpPopUp xp={xpState.amount} onComplete={dismissXpPopup} />
        )}
      </ThemeProvider>
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};