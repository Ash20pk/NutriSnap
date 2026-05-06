import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Spacing, Radius, Colors } from '../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightComponent?: React.ReactNode;
  showBack?: boolean;
}

export default function PageHeader({ title, subtitle, rightComponent, showBack }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={[
      styles.container,
      {
        paddingTop: Platform.OS === 'ios' ? insets.top + Spacing.md : insets.top + Spacing.xl,
        paddingBottom: Spacing.lg
      }
    ]}>
      <View style={styles.content}>
        <View style={styles.leftRow}>
          {showBack && (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {rightComponent && <View style={styles.rightContent}>{rightComponent}</View>}
      </View>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.background,
    },
    content: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xxl,
      paddingBottom: Spacing.md,
    },
    leftRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    backButton: {
      width: Radius.round,
      height: Radius.round,
      borderRadius: Radius.xxl,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textContainer: {
      flex: 1,
    },
    rightContent: {
      marginLeft: Spacing.lg,
    },
    title: {
      fontSize: 24,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 2,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
      opacity: 0.8,
    },
  });
}
