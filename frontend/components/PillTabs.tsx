import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Spacing, Radius, Colors } from '../constants/Colors';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

type Tab<Key extends string> = {
  key: Key;
  label: string;
  disabled?: boolean;
};

type Props<Key extends string> = {
  tabs: Tab<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
  style?: StyleProp<ViewStyle>;
  tabStyle?: StyleProp<ViewStyle>;
  activeTabStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  haptics?: boolean;
};

export default function PillTabs<Key extends string>({
  tabs,
  activeKey,
  onChange,
  style,
  tabStyle,
  activeTabStyle,
  textStyle,
  activeTextStyle,
  haptics = true,
}: Props<Key>) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={[styles.container, style]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, tabStyle, isActive && styles.activeTab, isActive && activeTabStyle]}
            activeOpacity={0.9}
            disabled={tab.disabled}
            onPress={() => {
              if (tab.disabled) return;
              if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onChange(tab.key);
            }}
          >
            <Text
              style={[styles.tabText, textStyle, isActive && styles.activeTabText, isActive && activeTextStyle]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: theme.white,
      borderRadius: Radius.xxl,
      padding: Spacing.xs,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 6,
    },
    tab: {
      flex: 1,
      paddingVertical: Spacing.sm + 2,
      borderRadius: Radius.lg,
      alignItems: 'center',
    },
    activeTab: {
      backgroundColor: theme.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '900',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    activeTabText: {
      color: theme.white,
    },
  });
}
