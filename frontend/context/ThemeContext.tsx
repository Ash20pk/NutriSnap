import React, { createContext, useContext, useMemo } from 'react';
import { Colors } from '../constants/Colors';

export type AppTheme = typeof Colors;

export const PinkTheme: AppTheme = {
  ...Colors,
  accent: '#C2185B',
  bg1: '#FFF0F5',
  bg2: '#F8BBD0',
  background: '#FFF0F5',
  backgroundSecondary: '#FCE4EC',
  backgroundTertiary: '#F8BBD0',
  cardBackground: '#FFFFFF',
  cardBackgroundSecondary: '#FFF8FA',
  text: '#2D0A1A',
  textSecondary: '#7B3A52',
  textLight: '#B06080',
  success: '#C2185B',
  primary: '#C2185B',
  primaryDark: '#880E4F',
  primaryLight: '#E91E8C',
  accentLight: '#E91E8C',
  accentDark: '#880E4F',
  secondary: '#7B3A52',
  tertiary: '#B06080',
  border: '#F8BBD0',
  borderLight: '#FCE4EC',
  borderSubtle: 'rgba(194, 24, 91, 0.08)',
  shadow: 'rgba(194, 24, 91, 0.08)',
  shadowDark: 'rgba(194, 24, 91, 0.15)',
  shadowSubtle: 'rgba(194, 24, 91, 0.12)',
  shadowLight: 'rgba(194, 24, 91, 0.08)',
  darkCard: '#2D0A1A',
  darkCardSecondary: '#3D1525',
  darkTextSecondary: '#F8BBD0',
  chartOrange: '#E91E8C',
  chartGreen: '#C2185B',
  gray100: '#FFF0F5',
  gray200: '#FCE4EC',
  gray300: '#F8BBD0',
  gray400: '#F48FB1',
  gray500: '#B06080',
  highLevels: '#E91E8C',
  blacks: '#2D0A1A',
  black: '#2D0A1A',
  protein: '#E91E8C',
  carbs: '#C2185B',
  fat: '#7B3A52',
};

type ThemeContextType = {
  theme: AppTheme;
  isSpecialUser: boolean;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: Colors,
  isSpecialUser: false,
});

export function ThemeProvider({
  children,
  isSpecialUser,
}: {
  children: React.ReactNode;
  isSpecialUser: boolean;
}) {
  const theme = useMemo(() => (isSpecialUser ? PinkTheme : Colors), [isSpecialUser]);

  return (
    <ThemeContext.Provider value={{ theme, isSpecialUser }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
