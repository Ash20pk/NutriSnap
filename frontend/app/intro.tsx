import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function Intro() {
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const features = useMemo(
    () => [
      {
        key: 'snap',
        icon: 'camera',
        title: 'Snap',
        text: 'Log meals in seconds',
        image: require('../assets/images/intro-snap.png'),
      },
      {
        key: 'understand',
        icon: 'sparkles',
        title: 'Understand',
        text: 'Clear macro breakdown',
        image: require('../assets/images/intro-macros.png'),
      },
      {
        key: 'leaderboard',
        icon: 'stats-chart',
        title: 'Leaderboard',
        text: 'Compete with friends & climb the ranks',
        image: require('../assets/images/leaderboard.png'),
      },
    ],
    []
  );

  const pageWidth = useMemo(() => Math.max(0, screenWidth - 48), [screenWidth]);
  const cardWidth = useMemo(() => Math.min(340, Math.max(260, pageWidth - 56)), [pageWidth]);
  const deckHeight = useMemo(() => Math.min(460, Math.max(320, screenHeight * 0.44)), [screenHeight]);
  const cardHeight = useMemo(() => Math.min(380, Math.max(280, deckHeight - 24)), [deckHeight]);
  const cardSpacing = 16;
  const itemSize = useMemo(() => cardWidth + cardSpacing, [cardWidth]);
  const sideInset = useMemo(() => Math.max(0, (pageWidth - cardWidth) / 2), [pageWidth, cardWidth]);
  const sliderWidth = useMemo(() => Math.min(420, pageWidth), [pageWidth]);
  const knobSize = 56;
  const maxTranslate = Math.max(0, sliderWidth - knobSize);

  const translateX = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const [isCompleting, setIsCompleting] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        if (isCompleting) return false;
        return Math.abs(gestureState.dx) > 6 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (isCompleting) return;
        const next = Math.max(0, Math.min(maxTranslate, gestureState.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: async (_evt, gestureState) => {
        if (isCompleting) return;
        const completed = gestureState.dx >= maxTranslate * 0.65;

        if (!completed) {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
          return;
        }

        setIsCompleting(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        Animated.timing(translateX, {
          toValue: maxTranslate,
          duration: 220,
          useNativeDriver: true,
        }).start(async () => {
          try {
            await AsyncStorage.setItem('ns_intro_seen', '1');
          } finally {
            router.replace('/auth');
          }
        });
      },
    })
  ).current;

  const progressScale = translateX.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const fillTranslateX = progressScale.interpolate({
    inputRange: [0, 1],
    outputRange: [-sliderWidth / 2, 0],
    extrapolate: 'clamp',
  });

  return (
    <LinearGradient
      colors={[Colors.bg1, Colors.bg2]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <Ionicons name="leaf" size={22} color={Colors.white} />
          </View>
          <Text style={styles.brand}>NutriSnap</Text>
        </View>

        <Text style={styles.title}>Eat smarter,{"\n"}one snap at a time.</Text>

        <View style={styles.featureGrid}>
          <Animated.FlatList
            data={features}
            keyExtractor={(item) => item.key}
            horizontal
            decelerationRate="fast"
            snapToInterval={itemSize}
            disableIntervalMomentum
            style={{ width: pageWidth, height: deckHeight, alignSelf: 'center' }}
            contentContainerStyle={{
              paddingLeft: sideInset,
              paddingRight: sideInset,
            }}
            showsHorizontalScrollIndicator={false}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => {
              const isLast = index === features.length - 1;
              const inputRange = [
                (index - 1) * itemSize,
                index * itemSize,
                (index + 1) * itemSize,
              ];
              const scale = scrollX.interpolate({
                inputRange,
                outputRange: [0.9, 1, 0.9],
                extrapolate: 'clamp',
              });
              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.55, 1, 0.55],
                extrapolate: 'clamp',
              });
              const rotate = scrollX.interpolate({
                inputRange,
                outputRange: ['-4deg', '0deg', '4deg'],
                extrapolate: 'clamp',
              });
              const translateYCard = scrollX.interpolate({
                inputRange,
                outputRange: [10, 0, 10],
                extrapolate: 'clamp',
              });

              return (
                <View
                  style={[
                    styles.carouselPage,
                    {
                      width: cardWidth,
                      height: deckHeight,
                      marginRight: isLast ? 0 : cardSpacing,
                    },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.featureCard,
                      {
                        width: cardWidth,
                        height: cardHeight,
                        opacity,
                        transform: [{ translateY: translateYCard }, { rotateZ: rotate }, { scale }],
                      },
                    ]}
                  >
                    <View style={styles.cardVisual}>
                      <Image source={item.image} style={styles.cardImage} resizeMode="cover" />
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={styles.cardFooterRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitle}>{item.title}</Text>
                          <Text style={styles.cardSubtitle}>{item.text}</Text>
                        </View>

                        <View style={styles.cardIconBadge}>
                          <Ionicons name={item.icon as any} size={20} color={Colors.white} />
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                </View>
              );
            }}
          />

          <View style={styles.dotsRow}>
            {features.map((f, index) => {
              const inputRange = [
                (index - 1) * itemSize,
                index * itemSize,
                (index + 1) * itemSize,
              ];
              const dotOpacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.25, 1, 0.25],
                extrapolate: 'clamp',
              });
              const dotScale = scrollX.interpolate({
                inputRange,
                outputRange: [0.9, 1.25, 0.9],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View
                  key={f.key}
                  style={[
                    styles.dot,
                    {
                      opacity: dotOpacity,
                      transform: [{ scale: dotScale }],
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={[styles.slider, { width: sliderWidth }]}>
          <Animated.View
            style={[
              styles.sliderFill,
              {
                transform: [{ translateX: fillTranslateX }, { scaleX: progressScale }],
                backgroundColor: Colors.primary,
              },
            ]}
          />

          <Text style={styles.sliderText}>Swipe to get started</Text>

          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.knob,
              {
                width: knobSize,
                height: knobSize,
                borderRadius: knobSize / 2,
                transform: [{ translateX }],
              },
            ]}
          >
            <Ionicons name="arrow-forward" size={22} color={Colors.white} />
          </Animated.View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  brand: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 16,
  },
  featureGrid: {
    marginTop: 32,
    flexGrow: 0,
    position: 'relative',
    height: 480,
  },
  carouselPage: {
    paddingTop: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  featureCard: {
    backgroundColor: Colors.white,
    borderRadius: 36,
    padding: 0,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 12,
    overflow: 'hidden',
    height: 440,
    width: Dimensions.get('window').width - 72,
  },
  cardVisual: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  cardFooter: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: Colors.white,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  dotsRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  },
  slider: {
    height: 72,
    backgroundColor: Colors.white,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 36,
  },
  sliderText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  knob: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 5,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
});
