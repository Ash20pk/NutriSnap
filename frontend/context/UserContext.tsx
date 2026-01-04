import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

interface UserProfile {
  id: string;
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
}

interface UserContextType {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  logout: () => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: authUser, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        if (!authUser) {
          console.log('[UserContext] No auth user, clearing profile');
          await AsyncStorage.removeItem('user_profile');
          setUserState(null);
          setIsLoading(false);
          return;
        }

        // Only load cached profile, don't call backend during auth flow
        const userData = await AsyncStorage.getItem('user_profile');
        if (userData) {
          console.log('[UserContext] Found cached profile');
          setUserState(JSON.parse(userData));
        } else {
          console.log('[UserContext] No cached profile - will load from backend later');
          setUserState(null);
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
    <UserContext.Provider value={{ user, setUser, logout, isLoading }}>
      {children}
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