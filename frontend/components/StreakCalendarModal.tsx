import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  startOfWeek,
  addDays,
  differenceInCalendarDays,
  subMonths,
  addMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
} from 'date-fns';
import { Colors } from '../constants/Colors';
import { questApi, ApiStreakCalendar } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

interface StreakCalendarModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
}

export default function StreakCalendarModal({
  visible,
  onClose,
  userId,
}: StreakCalendarModalProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const [loading, setLoading] = useState(false);
  const [calendar, setCalendar] = useState<ApiStreakCalendar | null>(null);
  const [currentViewDate, setCurrentViewDate] = useState(new Date());

  const fetchCalendar = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const cal = await questApi.getStreakCalendar(userId, 180);
      setCalendar(cal);
    } catch (e) {
      console.error('Failed to load streak calendar:', e);
      setCalendar(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible && userId) {
      setCurrentViewDate(new Date());
      fetchCalendar();
    }
  }, [visible, userId, fetchCalendar]);

  const changeMonth = (offset: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCurrentViewDate((prev) =>
      offset > 0 ? addMonths(prev, offset) : subMonths(prev, Math.abs(offset))
    );
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
  };

  const renderCalendarGrid = () => {
    if (!calendar?.start_date || !calendar?.end_date || !Array.isArray(calendar?.days)) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data yet.</Text>
        </View>
      );
    }

    const monthStart = startOfMonth(currentViewDate);
    const monthEnd = endOfMonth(currentViewDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });

    const byDate: Record<string, (typeof calendar.days)[0]> = {};
    for (const d of calendar.days) {
      if (d?.date) byDate[d.date] = d;
    }

    const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const cells: Date[] = [];
    const totalCells = Math.ceil((differenceInCalendarDays(monthEnd, gridStart) + 1) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      cells.push(addDays(gridStart, i));
    }

    return (
      <View>
        <View style={styles.weekdayRow}>
          {weekdays.map((w, idx) => (
            <Text key={`${w}-${idx}`} style={styles.weekdayText}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {cells.map((cellDate) => {
            const iso = format(cellDate, 'yyyy-MM-dd');
            const isCurrentMonth = isSameMonth(cellDate, currentViewDate);
            const item = isCurrentMonth ? byDate[iso] : null;
            const loggedFood = !!item?.logged_food;
            const wasActive = !!item?.was_active;
            const bg = loggedFood
              ? theme.primary
              : wasActive
                ? 'rgba(242,141,53,0.35)'
                : 'transparent';

            return (
              <View key={iso} style={styles.cellWrap}>
                <View
                  style={[
                    styles.cell,
                    !isCurrentMonth && styles.cellOut,
                    isCurrentMonth && (loggedFood || wasActive)
                      ? { backgroundColor: bg, borderColor: bg }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      !isCurrentMonth ? styles.cellTextOut : null,
                      isCurrentMonth && (loggedFood || wasActive)
                        ? { color: theme.white }
                        : null,
                    ]}
                  >
                    {format(cellDate, 'd')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.monthText}>
              {format(currentViewDate, 'MMMM yyyy')}
            </Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => changeMonth(-1)}
                style={styles.navButton}
              >
                <Ionicons name="chevron-back" size={20} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => changeMonth(1)}
                style={[
                  styles.navButton,
                  isSameMonth(currentViewDate, new Date()) && styles.navButtonDisabled,
                ]}
                disabled={isSameMonth(currentViewDate, new Date())}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
              <Text style={styles.legendText}>Logged food</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'rgba(242,141,53,0.35)' }]} />
              <Text style={styles.legendText}>Active</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : (
            <View style={styles.body}>{renderCalendarGrid()}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
    },
    card: {
      width: '90%',
      maxWidth: 320,
      backgroundColor: theme.white,
      borderRadius: 24,
      padding: 16,
      borderWidth: 2,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    monthText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    navButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    navButtonDisabled: {
      opacity: 0.3,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginLeft: 4,
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    legendText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    body: {
      width: '100%',
    },
    loadingContainer: {
      paddingVertical: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      color: theme.textSecondary,
      fontWeight: '700',
    },
    emptyContainer: {
      paddingVertical: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: theme.textSecondary,
      fontWeight: '700',
    },
    weekdayRow: {
      flexDirection: 'row',
      width: '100%',
      marginBottom: 8,
    },
    weekdayText: {
      width: `${100 / 7}%`,
      textAlign: 'center',
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: '100%',
    },
    cellWrap: {
      width: `${100 / 7}%`,
      padding: 3,
    },
    cell: {
      width: '100%',
      aspectRatio: 1,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cellOut: {
      borderColor: 'transparent',
    },
    cellText: {
      fontWeight: '900',
      color: theme.text,
      fontSize: 12,
    },
    cellTextOut: {
      color: theme.textSecondary,
      opacity: 0.35,
    },
  });
}
