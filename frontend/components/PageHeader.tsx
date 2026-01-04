import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors } from '../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightComponent?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, rightComponent }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[
      styles.container,
      { 
        paddingTop: Platform.OS === 'ios' ? insets.top + 12 : insets.top + 20,
        paddingBottom: 16
      }
    ]}>
      <View style={styles.content}>
        <View style={styles.leftContent}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {rightComponent && <View style={styles.rightContent}>{rightComponent}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  leftContent: {
    flex: 1,
  },
  rightContent: {
    marginLeft: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    opacity: 0.8,
  },
});
