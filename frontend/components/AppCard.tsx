import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';

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

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xxxl,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: Spacing.sm,
  },
  soft: {
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 6,
  },
  outline: {
    backgroundColor: 'transparent',
    borderBottomWidth: 6,
  },
});
