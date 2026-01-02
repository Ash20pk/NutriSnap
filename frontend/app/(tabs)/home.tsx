import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { mealApi } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { user } = useUser();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

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

  const caloriesProgress = calculateProgress(
    stats?.total_calories || 0,
    stats?.targets?.calories || 2000
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl 
          refreshing={loading} 
          onRefresh={fetchStats} 
          tintColor={Colors.primary} 
          colors={[Colors.primary]}
        />
      }
    >
      {/* Animated Header with Gradient */}
      <Animated.View 
        style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>Hey {user?.name}! 👋</Text>
            <Text style={styles.date}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
          <View style={styles.streakContainer}>
            <View style={styles.streakBadge}>
              <Text style={styles.streakNumber}>5</Text>
              <Ionicons name="flame" size={24} color={Colors.accent} />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Calories Progress - Big Circle */}
      <Animated.View 
        style={[
          styles.progressCard,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          }
        ]}
      >
        <Text style={styles.sectionTitle}>Today's Calories</Text>
        
        <View style={styles.caloriesCircleContainer}>
          {/* Outer decorative circle */}
          <View style={styles.outerCircle}>
            <View style={styles.progressRing}>
              <View 
                style={[
                  styles.progressRingFill,
                  { 
                    transform: [
                      { rotate: `${(caloriesProgress / 100) * 360}deg` }
                    ]
                  }
                ]}
              />
            </View>
            
            {/* Inner content */}
            <View style={styles.caloriesContent}>
              <Text style={styles.caloriesValue}>
                {Math.round(stats?.total_calories || 0)}
              </Text>
              <Text style={styles.caloriesLabel}>of {Math.round(stats?.targets?.calories || 2000)}</Text>
              <View style={styles.caloriesBadge}>
                <Text style={styles.caloriesBadgeText}>kcal</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Fun Progress Message */}
        <View style={styles.messageContainer}>
          {caloriesProgress < 30 ? (
            <Text style={styles.messageText}>🍽️ Just getting started!</Text>
          ) : caloriesProgress < 70 ? (
            <Text style={styles.messageText}>🎯 Great progress!</Text>
          ) : caloriesProgress < 100 ? (
            <Text style={styles.messageText}>🔥 Almost there!</Text>
          ) : (
            <Text style={styles.messageText}>🎉 Goal crushed!</Text>
          )}
        </View>
      </Animated.View>

      {/* Macros - Colorful Cards */}
      <Text style={styles.sectionTitle}>Macros Breakdown</Text>
      <View style={styles.macrosGrid}>
        {/* Protein */}
        <TouchableOpacity activeOpacity={0.9} style={styles.macroCard}>
          <LinearGradient
            colors={[Colors.protein, '#FF6B6B']}
            style={styles.macroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.macroIcon}>
              <Ionicons name="fitness" size={28} color={Colors.white} />
            </View>
            <Text style={styles.macroLabel}>Protein</Text>
            <Text style={styles.macroValue}>{Math.round(stats?.total_protein || 0)}g</Text>
            <View style={styles.macroProgress}>
              <View 
                style={[
                  styles.macroProgressFill,
                  { 
                    width: `${calculateProgress(
                      stats?.total_protein || 0,
                      stats?.targets?.protein || 150
                    )}%` 
                  }
                ]} 
              />
            </View>
            <Text style={styles.macroTarget}>of {Math.round(stats?.targets?.protein || 150)}g</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Carbs */}
        <TouchableOpacity activeOpacity={0.9} style={styles.macroCard}>
          <LinearGradient
            colors={[Colors.carbs, '#FFC837']}
            style={styles.macroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.macroIcon}>
              <Ionicons name="flame" size={28} color={Colors.white} />
            </View>
            <Text style={styles.macroLabel}>Carbs</Text>
            <Text style={styles.macroValue}>{Math.round(stats?.total_carbs || 0)}g</Text>
            <View style={styles.macroProgress}>
              <View 
                style={[
                  styles.macroProgressFill,
                  { 
                    width: `${calculateProgress(
                      stats?.total_carbs || 0,
                      stats?.targets?.carbs || 200
                    )}%` 
                  }
                ]} 
              />
            </View>
            <Text style={styles.macroTarget}>of {Math.round(stats?.targets?.carbs || 200)}g</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Fat */}
        <TouchableOpacity activeOpacity={0.9} style={styles.macroCard}>
          <LinearGradient
            colors={[Colors.fat, '#4DD4FF']}
            style={styles.macroGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.macroIcon}>
              <Ionicons name="water" size={28} color={Colors.white} />
            </View>
            <Text style={styles.macroLabel}>Fat</Text>
            <Text style={styles.macroValue}>{Math.round(stats?.total_fat || 0)}g</Text>
            <View style={styles.macroProgress}>
              <View 
                style={[
                  styles.macroProgressFill,
                  { 
                    width: `${calculateProgress(
                      stats?.total_fat || 0,
                      stats?.targets?.fat || 65
                    )}%` 
                  }
                ]} 
              />
            </View>
            <Text style={styles.macroTarget}>of {Math.round(stats?.targets?.fat || 65)}g</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity activeOpacity={0.9} style={[styles.actionButton, { backgroundColor: Colors.secondary }]}>
          <Ionicons name="restaurant" size={24} color={Colors.white} />
          <Text style={styles.actionButtonText}>Log Meal</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} style={[styles.actionButton, { backgroundColor: Colors.tertiary }]}>
          <Ionicons name="time" size={24} color={Colors.white} />
          <Text style={styles.actionButtonText}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Daily Tip Card */}
      <View style={styles.tipCard}>
        <View style={styles.tipIcon}>
          <Ionicons name="bulb" size={32} color={Colors.accent} />
        </View>
        <View style={styles.tipContent}>
          <Text style={styles.tipTitle}>💡 Pro Tip!</Text>
          <Text style={styles.tipText}>
            Place a coin next to your food when snapping photos for super accurate portion tracking!
          </Text>
        </View>
      </View>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  date: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  streakContainer: {
    alignItems: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 4,
    shadowColor: Colors.shadowDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  streakNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
    marginTop: 8,
  },
  progressCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    shadowColor: Colors.shadowDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  caloriesCircleContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  outerCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  progressRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 12,
    borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  progressRingFill: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 12,
    borderColor: Colors.primary,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  caloriesContent: {
    alignItems: 'center',
  },
  caloriesValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  caloriesLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  caloriesBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  caloriesBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.white,
  },
  messageContainer: {
    alignItems: 'center',
  },
  messageText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  macrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  macroCard: {
    width: (width - 52) / 3,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: Colors.shadowDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  macroGradient: {
    padding: 16,
    alignItems: 'center',
  },
  macroIcon: {
    marginBottom: 8,
  },
  macroLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: 4,
  },
  macroValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: 8,
  },
  macroProgress: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  macroProgressFill: {
    height: '100%',
    backgroundColor: Colors.white,
  },
  macroTarget: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 16,
    shadowColor: Colors.shadowDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.white,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF9E6',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 2,
    borderColor: Colors.accent,
    shadowColor: Colors.shadowDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  tipIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 6,
  },
  tipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});