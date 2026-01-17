import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../constants/Colors';

type Action = {
  label: string;
  onPress: () => void;
};

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: Action;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
};

export default function EmptyState({
  icon,
  title,
  subtitle,
  action,
  style,
  titleStyle,
  subtitleStyle,
}: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={Colors.textSecondary} />
      </View>
      <Text style={[styles.title, titleStyle]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
      {action ? (
        <TouchableOpacity style={styles.actionButton} activeOpacity={0.9} onPress={action.onPress}>
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.section,
  },
  iconWrap: {
    width: Spacing.section,
    height: Spacing.section,
    borderRadius: Radius.round,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    fontWeight: '600',
    lineHeight: 22,
  },
  actionButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg + 2,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
