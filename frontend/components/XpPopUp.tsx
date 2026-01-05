import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface XpPopUpProps {
  xp: number;
  onComplete: () => void;
}

export default function XpPopUp({ xp, onComplete }: XpPopUpProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(animatedValue, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.delay(1500),
      Animated.timing(animatedValue, {
        toValue: 2,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
    });
  }, [animatedValue, onComplete]);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 0.2, 1, 1.5, 2],
    outputRange: [0, 1, 1, 1, 0],
  });

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [50, 0, -100],
  });

  const scale = animatedValue.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0.5, 1.2, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <View style={styles.card}>
        <Ionicons name="sparkles" size={24} color={Colors.warning} />
        <Text style={styles.text}>+{xp} XP</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: Colors.warning,
    borderBottomWidth: 8,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  text: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.warning,
    textTransform: 'uppercase',
  },
});
