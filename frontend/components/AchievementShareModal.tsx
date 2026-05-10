import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { feedApi } from '../utils/api';
import * as Haptics from 'expo-haptics';

export interface Achievement {
  type: 'badge' | 'streak' | 'goal' | 'xp_level';
  title: string;
  description?: string;
  icon?: string;
  xp?: number;
  metadata?: Record<string, any>;
}

interface Props {
  visible: boolean;
  achievement: Achievement | null;
  onClose: () => void;
}

const TIER_GRADIENTS: Record<number, [string, string]> = {
  3: ['#F5C518', '#F28D35'],   // gold
  2: ['#B0B0B0', '#787878'],   // silver
  1: ['#D4874A', '#A0522D'],   // bronze
};

const TYPE_GRADIENTS: Record<string, [string, string]> = {
  streak: ['#FF6B35', '#FF3D00'],
  goal:   ['#2F593E', '#4CAF50'],
  xp_level: ['#5B6AF0', '#C05FF0'],
  badge:  ['#F5C518', '#F28D35'],
};

export default function AchievementShareModal({ visible, achievement, onClose }: Props) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const confettiAnims = useRef([...Array(8)].map(() => new Animated.Value(0))).current;
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (visible) {
      setShared(false);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // Confetti burst
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const anims = confettiAnims.map((a, i) =>
        Animated.sequence([
          Animated.delay(i * 60),
          Animated.spring(a, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }),
        ])
      );
      Animated.parallel(anims).start();
    } else {
      scaleAnim.setValue(0.7);
      opacityAnim.setValue(0);
      confettiAnims.forEach(a => a.setValue(0));
    }
  }, [visible, scaleAnim, opacityAnim, confettiAnims]);

  if (!achievement) return null;

  const tier = achievement.metadata?.badge_tier ?? 1;
  const gradient = achievement.type === 'badge'
    ? (TIER_GRADIENTS[tier] ?? TIER_GRADIENTS[1])
    : (TYPE_GRADIENTS[achievement.type] ?? TYPE_GRADIENTS.badge);

  const confettiPositions = [
    { top: -30, left: '10%' }, { top: -20, left: '35%' }, { top: -35, left: '60%' }, { top: -25, left: '85%' },
    { top: -15, right: '10%' }, { top: -40, right: '35%' }, { top: -20, right: '60%' }, { top: -30, right: '80%' },
  ];
  const confettiColors = ['#FF6B35', '#F5C518', '#5B6AF0', '#E05C7A', '#4CAF50', '#F28D35', '#C05FF0', '#3B9FE8'];

  const handleShare = async () => {
    if (!achievement || sharing || shared) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSharing(true);
    try {
      await feedApi.createPost({
        event_type: achievement.type,
        title: achievement.title,
        body: achievement.description,
        metadata: achievement.metadata,
      });
      setShared(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(onClose, 1200);
    } catch (e) {
      console.error('Share failed:', e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>

          {/* Confetti */}
          {confettiAnims.map((a, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                confettiPositions[i] as any,
                {
                  opacity: a,
                  transform: [
                    { scale: a },
                    { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -20] }) },
                  ],
                },
              ]}
            >
              <View style={[styles.confettiDot, { backgroundColor: confettiColors[i] }]} />
            </Animated.View>
          ))}

          {/* Achievement card */}
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
            <Text style={styles.badgeIcon}>{achievement.icon ?? (achievement.type === 'badge' ? '🏅' : achievement.type === 'streak' ? '🔥' : achievement.type === 'goal' ? '🎯' : '⚡')}</Text>
            {achievement.xp && achievement.xp > 0 ? (
              <View style={styles.xpPill}>
                <Text style={styles.xpText}>+{achievement.xp} XP</Text>
              </View>
            ) : null}
          </LinearGradient>

          {/* Text */}
          <Text style={styles.congrats}>Achievement unlocked!</Text>
          <Text style={styles.title}>{achievement.title}</Text>
          {achievement.description ? (
            <Text style={styles.desc}>{achievement.description}</Text>
          ) : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* LinkedIn-style share prompt */}
          <Text style={styles.sharePrompt}>Share this with your followers?</Text>
          <Text style={styles.shareSubPrompt}>Let your community celebrate with you</Text>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.skipBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, shared && styles.shareBtnDone]}
              onPress={handleShare}
              activeOpacity={0.88}
              disabled={sharing || shared}
            >
              <LinearGradient
                colors={shared ? ['#4CAF50', '#2F593E'] : gradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {sharing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={shared ? 'checkmark-circle' : 'share-social'} size={18} color="#fff" />
                  <Text style={styles.shareBtnText}>{shared ? 'Shared!' : 'Share to Feed'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: theme.white,
      borderRadius: 28,
      padding: 28,
      width: '100%',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 8,
      position: 'relative',
      overflow: 'visible',
    },
    confetti: {
      position: 'absolute',
    },
    confettiDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    badge: {
      width: 100,
      height: 100,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 8,
    },
    badgeIcon: { fontSize: 48 },
    xpPill: {
      position: 'absolute',
      bottom: -12,
      backgroundColor: Colors.warning,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#fff',
    },
    xpText: { fontSize: 12, fontWeight: '900', color: '#fff' },
    congrats: {
      fontSize: 12,
      fontWeight: '800',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: 8,
    },
    title: {
      fontSize: 22,
      fontWeight: '900',
      color: theme.text,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 26,
    },
    desc: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
    },
    divider: {
      width: '100%',
      height: 1,
      backgroundColor: theme.border,
      marginVertical: 20,
    },
    sharePrompt: {
      fontSize: 16,
      fontWeight: '900',
      color: theme.text,
      textAlign: 'center',
    },
    shareSubPrompt: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 20,
    },
    btnRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    skipBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 16,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
      backgroundColor: theme.white,
    },
    skipBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.textSecondary,
    },
    shareBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: 'transparent',
      borderBottomWidth: 4,
      borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    shareBtnDone: {
      borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    shareBtnText: {
      fontSize: 14,
      fontWeight: '900',
      color: '#fff',
    },
  });
}
