import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
  Animated,
  // Platform,
} from 'react-native';
import { Colors } from '../constants/Colors';
import * as Haptics from 'expo-haptics';

interface DuoButtonProps {
  title: string;
  onPress: () => void;
  color?: string;
  shadowColor?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function DuoButton({
  title,
  onPress,
  color = Colors.primary,
  shadowColor,
  style,
  textStyle,
  disabled,
  loading,
  size = 'medium',
}: DuoButtonProps) {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  const finalShadowColor = shadowColor || (color === Colors.primary ? '#1A3A2A' : 'rgba(0,0,0,0.2)');

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  const paddingVertical = size === 'small' ? 8 : size === 'medium' ? 14 : 18;
  const fontSize = size === 'small' ? 14 : size === 'medium' ? 16 : 18;

  return (
    <View style={[styles.container, style]}>
      {/* Shadow Layer */}
      <View
        style={[
          styles.shadow,
          {
            backgroundColor: finalShadowColor,
            borderRadius: 16,
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
            { backgroundColor: color, paddingVertical, borderRadius: 16 },
            disabled && styles.disabled,
          ]}
        >
          <Text style={[styles.text, { fontSize }, textStyle]}>
            {loading ? '...' : title}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 4,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
  },
  text: {
    color: Colors.white,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
