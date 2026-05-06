import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Spacing, Radius, Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';

type Variant = 'default' | 'soft' | 'outline';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  variant?: Variant;
  padding?: number;
};

export default function AppCard({
  children,
  style,
  contentStyle,
  variant = 'default',
  padding,
}: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const basePadding = typeof padding === 'number' ? padding : Spacing.xl;

  return (
    <View
      style={[
        styles.base,
        variant === 'soft' && styles.soft,
        variant === 'outline' && styles.outline,
        style,
      ]}
    >
      <View style={[{ padding: basePadding }, contentStyle]}>{children}</View>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    base: {
      backgroundColor: theme.white,
      borderRadius: Radius.xxxl,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: Spacing.sm,
    },
    soft: {
      backgroundColor: theme.backgroundSecondary,
      borderBottomWidth: 6,
    },
    outline: {
      backgroundColor: 'transparent',
      borderBottomWidth: 6,
    },
  });
}
