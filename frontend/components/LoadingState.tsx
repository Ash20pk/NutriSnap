import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Spacing, Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';

type Props = {
  label?: string;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function LoadingState({ label, size = 'large', style, textStyle }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size={size} color={theme.primary} />
      {label ? <Text style={[styles.label, textStyle]}>{label}</Text> : null}
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
      gap: Spacing.md,
    },
    label: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
}
