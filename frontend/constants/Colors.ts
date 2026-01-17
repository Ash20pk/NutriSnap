// NutriSnap Color Palette - Exact colors from user

export const Colors = {
  // Main colors
  accent: '#2F593E',
  bg1: '#F2E5D5',
  bg2: '#BFA893',
  highLevels: '#F28D35',
  blacks: '#0D0808',
  
  // Background colors
  background: '#F2E5D5',
  backgroundSecondary: '#E8DCC0',
  backgroundTertiary: '#D4C8AC',
  
  // Card colors
  cardBackground: '#FFFFFF',
  cardBackgroundSecondary: '#FAFAFA',
  
  // Text colors
  text: '#0D0808',
  textSecondary: '#5A4A3A',
  textLight: '#8B7A6A',
  textInverse: '#FFFFFF',
  
  // Status colors
  success: '#2F593E',
  warning: '#F28D35',
  error: '#D32F2F',
  info: '#2196F3',
  
  // Macro colors
  protein: '#F28D35',
  carbs: '#2F593E',
  fat: '#5A4A3A',

  // Progress bar colors (iOS-style)
  progressGreen: '#34C759',
  progressOrange: '#FF9500',
  progressRed: '#FF3B30',

  // Subtle border colors
  borderSubtle: 'rgba(0, 0, 0, 0.05)',
  shadowSubtle: 'rgba(0, 0, 0, 0.2)',
  shadowLight: 'rgba(0, 0, 0, 0.1)',

  // White overlay colors (for dark backgrounds)
  whiteOverlay10: 'rgba(255, 255, 255, 0.1)',
  whiteOverlay20: 'rgba(255, 255, 255, 0.2)',
  whiteOverlay80: 'rgba(255, 255, 255, 0.8)',
  
  // Neutral colors
  white: '#FFFFFF',
  black: '#0D0808',
  gray100: '#F2E5D5',
  gray200: '#E8DCC0',
  gray300: '#D4C8AC',
  gray400: '#BFA893',
  gray500: '#8B7A6A',
  
  // Border colors
  border: '#D4C8AC',
  borderLight: '#E8DCC0',
  
  // Shadow colors
  shadow: 'rgba(13, 8, 8, 0.08)',
  shadowDark: 'rgba(13, 8, 8, 0.12)',
  
  // Additional colors
  darkCard: '#0D0808',
  darkCardSecondary: '#1A1414',
  darkText: '#FFFFFF',
  darkTextSecondary: '#BFA893',
  chartOrange: '#F28D35',
  chartGreen: '#2F593E',
  
  // Aliases for compatibility
  primary: '#2F593E',
  primaryDark: '#1A3A2A',
  primaryLight: '#4A7A5A',
  accentLight: '#4A6A4A',
  accentDark: '#1A3A2A',
  secondary: '#5A4A3A',
  tertiary: '#8B7A6A',
};

// Spacing system (8-point grid with common additions)
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
  section: 80,  // For large section padding
};

// Border radius system
export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  xxxxl: 32,
  round: 40,    // For circular elements
  full: 9999,
};

// Opacity values for consistent transparency
export const Opacity = {
  disabled: 0.5,
  overlay: 0.7,
  subtle: 0.1,
  light: 0.15,
  medium: 0.3,
};

// Helper to create rgba from hex with opacity
export const withOpacity = (hex: string, opacity: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};