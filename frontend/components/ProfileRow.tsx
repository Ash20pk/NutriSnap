import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../constants/Colors';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  value: string | number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  showDivider?: boolean;
};

export default function ProfileRow({
  icon,
  iconColor = Colors.primary,
  label,
  value,
  style,
  labelStyle,
  valueStyle,
  showDivider = false,
}: Props) {
  return (
    <View style={style}>
      <View style={styles.container}>
        <View style={styles.left}>
          <View style={[styles.iconWrap, { backgroundColor: iconColor + '15' }]}>
            <Ionicons name={icon} size={20} color={iconColor} />
          </View>
          <Text style={[styles.label, labelStyle]}>{label}</Text>
        </View>
        <Text style={[styles.value, valueStyle]}>{value}</Text>
      </View>
      {showDivider && <View style={styles.divider} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg - 2,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  value: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.3,
  },
});
