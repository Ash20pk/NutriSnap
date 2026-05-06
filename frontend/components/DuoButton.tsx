import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
  Animated,
} from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

interface DuoButtonProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  color?: string;
  shadowColor?: string;
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function DuoButton({
  title,
  subtitle,
  onPress,
  color,
  shadowColor,
  leftIcon,
  style,
  textStyle,
  disabled,
  loading,
  size = 'medium',
}: DuoButtonProps) {
  const { theme } = useTheme();
  const resolvedColor = color ?? theme.primary;
  const animatedValue = React.useRef(new Animated.Value(0)).current;
  const [dots, setDots] = React.useState('');

  React.useEffect(() => {
    if (!loading) {
      setDots('');
      return;
    }

    let mounted = true;
    const states = ['', '.', '..', '...'];
    let i = 0;
    setDots(states[i]);

    const id = setInterval(() => {
      i = (i + 1) % states.length;
      if (mounted) setDots(states[i]);
    }, 350);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [loading]);

  const finalShadowColor = shadowColor || (resolvedColor === theme.primary ? theme.primaryDark : theme.shadowSubtle);

  const onPressIn = () => {
    if (disabled || loading) return;
    Animated.spring(animatedValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  const onPressOut = () => {
    if (disabled || loading) return;
    Animated.spring(animatedValue, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 5,
    }).start();
  };

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });
    onPress();
  };

  const paddingVertical = size === 'small' ? 8 : (subtitle ? 10 : (size === 'medium' ? 14 : 18));
  const fontSize = size === 'small' ? 14 : size === 'medium' ? 16 : 18;

  return (
    <View style={[styles.container, style]}>
      {/* Shadow Layer */}
      <View
        style={[
          styles.shadow,
          {
            backgroundColor: finalShadowColor,
            borderRadius: Radius.xl,
            bottom: -4,
          },
        ]}
      />
      {/* Button Layer */}
      <Animated.View style={{ transform: [{ translateY }] }}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handlePress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled || loading}
          style={[
            styles.button,
            { backgroundColor: resolvedColor, paddingVertical, borderRadius: Radius.xl },
            disabled && styles.disabled,
          ]}
        >
          <View style={styles.contentRow}>
            <View style={styles.leftIconSlot}>
              {loading ? null : leftIcon}
            </View>
            <View style={styles.textColumn}>
              <Text style={[styles.text, { fontSize, color: theme.white }, textStyle]}>
                {loading ? `${title}${dots}` : title}
              </Text>
              {subtitle && !loading && (
                <Text style={[styles.subtitle, { color: theme.white }]}>{subtitle}</Text>
              )}
            </View>
            <View style={styles.rightIconSlot} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: Spacing.xs,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  textColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIconSlot: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm + 2,
  },
  rightIconSlot: {
    width: 22,
    marginLeft: Spacing.sm + 2,
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
  },
  text: {
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    opacity: 0.9,
    marginTop: 2,
  },
  disabled: {
    opacity: 0.5,
  },
});
