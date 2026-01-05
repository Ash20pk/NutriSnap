import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';

interface AnimatedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  duration?: number;
  type?: 'fade' | 'slide' | 'pop';
}

export default function AnimatedCard({
  children,
  style,
  delay = 0,
  duration = 500,
  type = 'pop',
}: AnimatedCardProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, [delay, duration, animatedValue]);

  const getTransform = () => {
    switch (type) {
      case 'pop':
        return [
          {
            scale: animatedValue.interpolate({
              inputRange: [0, 0.8, 1],
              outputRange: [0.8, 1.05, 1],
            }),
          },
        ];
      case 'slide':
        return [
          {
            translateY: animatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            }),
          },
        ];
      default:
        return [];
    }
  };

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: animatedValue,
          transform: getTransform(),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
