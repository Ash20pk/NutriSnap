import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import { waterApi, WaterToday } from '../utils/api';
import { useFocusEffect } from 'expo-router';
import AnimatedCard from './AnimatedCard';
import AppCard from './AppCard';
import SectionTitle from './SectionTitle';

interface HydrationTrackerProps {
  userId?: string;
  delay?: number;
  readOnly?: boolean;
  externalRefresh?: number;
}

export default function HydrationTracker({ userId, delay = 380, readOnly = false, externalRefresh }: HydrationTrackerProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  
  const [waterData, setWaterData] = useState<WaterToday | null>(null);
  const [waterAdding, setWaterAdding] = useState(false);
  const waveAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [waveAnim]);

  const fetchWater = useCallback(async () => {
    if (!userId) return;
    try {
      const water = await waterApi.getToday(userId);
      setWaterData(water);
    } catch (error) {
      console.error('Error fetching water:', error);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchWater();
    }, [fetchWater])
  );

  // Allow parent pull-to-refresh to trigger a water refetch
  useEffect(() => {
    if (externalRefresh !== undefined && externalRefresh > 0) {
      fetchWater();
    }
  }, [externalRefresh, fetchWater]);

  const addWater = async (ml: number) => {
    if (!userId || waterAdding) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setWaterAdding(true);
    try {
      await waterApi.logWater(userId, ml);
      await fetchWater();
    } catch (e) {
      console.error('Water log failed:', e);
    } finally {
      setWaterAdding(false);
    }
  };

  const undoLastWater = async () => {
    if (!userId || !waterData?.logs?.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setWaterAdding(true);
    try {
      const last = waterData.logs[0];
      await waterApi.deleteLog(userId, last.id);
      await fetchWater();
    } catch (e) {
      console.error('Undo water failed:', e);
    } finally {
      setWaterAdding(false);
    }
  };

  const percentage = Math.min(waterData?.percentage ?? 0, 100);
  const currentLiters = waterData ? Math.round(waterData.total_ml / 100) / 10 : 0;
  const goalLiters = waterData ? Math.round((waterData.goal_ml) / 100) / 10 : 2.5;

  return (
    <AnimatedCard delay={delay} type="slide" style={styles.section}>
      <SectionTitle title="Hydration" />
      <AppCard style={styles.standardCard} padding={0}>
        <View style={styles.waterContent}>
          
          {/* Top Info */}
          <View style={styles.waterTopRow}>
            <View>
              <Text style={styles.waterValue}>
                {currentLiters}
                <Text style={styles.waterUnit}> L</Text>
              </Text>
              <Text style={styles.waterGoalText}>of {goalLiters} L goal</Text>
            </View>
            <View style={styles.waterPercentBadge}>
              <Text style={styles.waterPercentText}>{Math.round(waterData?.percentage ?? 0)}%</Text>
            </View>
          </View>

          {/* Interactive Horizontal Bottle */}
          <View style={styles.barContainer}>
            <View style={styles.barShapeOuter}>
              <View style={styles.barShapeInner}>
                <View style={[styles.barLiquid, { width: `${percentage}%` }]}>
                  {percentage > 0 && percentage < 100 && (
                    <Animated.View style={[
                      styles.wave,
                      {
                        transform: [
                          {
                            translateX: waveAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, -100]
                            })
                          }
                        ]
                      }
                    ]} />
                  )}
                </View>
                {/* Markers */}
                <View style={[styles.barMarker, { left: '25%' }]} />
                <View style={[styles.barMarker, { left: '50%' }]} />
                <View style={[styles.barMarker, { left: '75%' }]} />
              </View>
            </View>
            {/* The Cap */}
            <View style={styles.barCap} />
          </View>

          {!readOnly && (
            <>
              {/* Quick Add Buttons */}
              <View style={styles.waterButtons}>
                {[250, 500].map((ml) => (
                  <TouchableOpacity
                    key={ml}
                    style={styles.waterAddBtn}
                    onPress={() => addWater(ml)}
                    disabled={waterAdding}
                  >
                    <Ionicons name="water" size={18} color={theme.white} />
                    <Text style={styles.waterAddBtnText}>+{ml}ml</Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {(waterData?.logs?.length ?? 0) > 0 && (
                <TouchableOpacity style={styles.waterUndoBtn} onPress={undoLastWater}>
                  <Ionicons name="arrow-undo" size={15} color={theme.textSecondary} />
                  <Text style={styles.waterUndoText}>Undo Last Entry</Text>
                </TouchableOpacity>
              )}
            </>
          )}

        </View>
      </AppCard>
    </AnimatedCard>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    section: {
      marginBottom: 24,
    },
    standardCard: {
      backgroundColor: theme.white,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 6,
    },
    waterContent: {
      padding: 20,
      alignItems: 'center',
    },
    waterTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      width: '100%',
      marginBottom: 24,
    },
    waterValue: {
      fontSize: 36,
      fontWeight: '900',
      color: theme.text,
      lineHeight: 40,
    },
    waterUnit: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    waterGoalText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textSecondary,
      marginTop: 2,
    },
    waterPercentBadge: {
      backgroundColor: theme.primary + '15',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.primary + '30',
    },
    waterPercentText: {
      color: theme.primary,
      fontSize: 14,
      fontWeight: '900',
    },
    barContainer: {
      width: '100%',
      height: 48,
      alignItems: 'center',
      marginBottom: 20,
      position: 'relative',
      flexDirection: 'row',
      paddingRight: 10,
    },
    barShapeOuter: {
      flex: 1,
      height: '100%',
      backgroundColor: theme.backgroundSecondary,
      borderTopLeftRadius: 24,
      borderBottomLeftRadius: 24,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderWidth: 3,
      borderColor: theme.text,
      position: 'relative',
    },
    barShapeInner: {
      flex: 1,
      borderTopLeftRadius: 21,
      borderBottomLeftRadius: 21,
      borderTopRightRadius: 13,
      borderBottomRightRadius: 13,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    barCap: {
      width: 12,
      height: 24,
      backgroundColor: theme.text,
      borderTopRightRadius: 6,
      borderBottomRightRadius: 6,
    },
    barLiquid: {
      height: '100%',
      backgroundColor: '#3B9FE8',
      position: 'relative',
      overflow: 'hidden',
    },
    wave: {
      position: 'absolute',
      right: -20,
      top: 0,
      width: 200,
      height: '200%',
      backgroundColor: '#3B9FE8',
      borderRadius: 100,
      opacity: 0.8,
    },
    barMarker: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: theme.text,
      opacity: 0.15,
    },
    waterButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      marginBottom: 16,
    },
    waterAddBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#3B9FE8',
      paddingVertical: 14,
      borderRadius: 16,
      gap: 8,
      borderBottomWidth: 4,
      borderBottomColor: '#2574A9',
    },
    waterAddBtnText: {
      color: theme.white,
      fontSize: 16,
      fontWeight: '900',
    },
    waterUndoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      padding: 8,
    },
    waterUndoText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
