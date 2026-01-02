import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { user } = useUser();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await mealApi.getStats(user.id);
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchStats} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {user?.name || 'There'}!</Text>
          <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d')}</Text>
        </View>
        <View style={styles.streakBadge}>
          <Ionicons name="flame" size={20} color={Colors.accent} />
          <Text style={styles.streakText}>5</Text>
        </View>
      </View>

      {/* Daily Progress Card */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>Today's Progress</Text>
          <Text style={styles.mealsLogged}>
            {stats?.meals_logged || 0} meals logged
          </Text>
        </View>

        {/* Calories Circle */}
        <View style={styles.caloriesContainer}>
          <View style={styles.caloriesCircle}>
            <View
              style={[
                styles.caloriesProgress,
                {
                  transform: [
                    {
                      rotate: `${calculateProgress(
                        stats?.total_calories || 0,
                        stats?.targets?.calories || 2000
                      ) * 3.6}deg`,
                    },
                  ],
                },
              ]}
            />
            <View style={styles.caloriesInner}>
              <Text style={styles.caloriesValue}>
                {Math.round(stats?.total_calories || 0)}
              </Text>
              <Text style={styles.caloriesTarget}>
                / {Math.round(stats?.targets?.calories || 2000)}
              </Text>
              <Text style={styles.caloriesLabel}>kcal</Text>
            </View>
          </View>
          <Text style={styles.caloriesDescription}>
            {stats?.total_calories < (stats?.targets?.calories || 2000)
              ? `${Math.round((stats?.targets?.calories || 2000) - (stats?.total_calories || 0))} kcal remaining`
              : 'Target reached!'}
          </Text>
        </View>

        {/* Macros Row */}
        <View style={styles.macrosContainer}>
          <View style={styles.macroItem}>
            <View style={styles.macroIconContainer}>
              <Ionicons name="fitness" size={20} color={Colors.primary} />
            </View>
            <View style={styles.macroInfo}>
              <Text style={styles.macroLabel}>Protein</Text>
              <Text style={styles.macroValue}>
                {Math.round(stats?.total_protein || 0)}g
              </Text>
              <View style={styles.macroProgress}>
                <View
                  style={[
                    styles.macroProgressBar,
                    {
                      width: `${calculateProgress(
                        stats?.total_protein || 0,
                        stats?.targets?.protein || 150
                      )}%`,
                      backgroundColor: Colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.macroItem}>
            <View style={[styles.macroIconContainer, { backgroundColor: '#FFF5E6' }]}>
              <Ionicons name="leaf" size={20} color="#E8956F" />
            </View>
            <View style={styles.macroInfo}>
              <Text style={styles.macroLabel}>Carbs</Text>
              <Text style={styles.macroValue}>
                {Math.round(stats?.total_carbs || 0)}g
              </Text>
              <View style={styles.macroProgress}>
                <View
                  style={[
                    styles.macroProgressBar,
                    {
                      width: `${calculateProgress(
                        stats?.total_carbs || 0,
                        stats?.targets?.carbs || 200
                      )}%`,
                      backgroundColor: '#E8956F',
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          <View style={styles.macroItem}>
            <View style={[styles.macroIconContainer, { backgroundColor: '#FFF0F0' }]}>
              <Ionicons name="water" size={20} color="#D66853" />
            </View>
            <View style={styles.macroInfo}>
              <Text style={styles.macroLabel}>Fat</Text>
              <Text style={styles.macroValue}>
                {Math.round(stats?.total_fat || 0)}g
              </Text>
              <View style={styles.macroProgress}>
                <View
                  style={[
                    styles.macroProgressBar,
                    {
                      width: `${calculateProgress(
                        stats?.total_fat || 0,
                        stats?.targets?.fat || 65
                      )}%`,
                      backgroundColor: '#D66853',
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStatsContainer}>
        <View style={styles.quickStatCard}>
          <Ionicons name="trophy" size={24} color={Colors.accent} />
          <Text style={styles.quickStatValue}>{user?.goal.replace('_', ' ')}</Text>
          <Text style={styles.quickStatLabel}>Goal</Text>
        </View>
        <View style={styles.quickStatCard}>
          <Ionicons name="barbell" size={24} color={Colors.primary} />
          <Text style={styles.quickStatValue}>{user?.activity_level}</Text>
          <Text style={styles.quickStatLabel}>Activity</Text>
        </View>
        <View style={styles.quickStatCard}>
          <Ionicons name="scale" size={24} color={Colors.accent} />
          <Text style={styles.quickStatValue}>{user?.weight} kg</Text>
          <Text style={styles.quickStatLabel}>Weight</Text>
        </View>
      </View>

      {/* Tips Card */}
      <View style={styles.tipCard}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb" size={24} color={Colors.accent} />
          <Text style={styles.tipTitle}>Tip of the Day</Text>
        </View>
        <Text style={styles.tipText}>
          Place a coin next to your food when taking photos. This helps our AI accurately measure
          portion sizes for precise calorie tracking!
        </Text>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  date: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  streakText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  progressCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  mealsLogged: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  caloriesContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  caloriesCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  caloriesProgress: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 80,
    borderWidth: 12,
    borderColor: Colors.primary,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  caloriesInner: {
    alignItems: 'center',
  },
  caloriesValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
  },
  caloriesTarget: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  caloriesLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  caloriesDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  macrosContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  macroItem: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  macroIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  macroInfo: {
    flex: 1,
  },
  macroLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  macroProgress: {
    height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
    overflow: 'hidden',
  },
  macroProgressBar: {
    height: '100%',
  },
  quickStatsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 8,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  quickStatLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  tipCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.text,
  },
  tipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});