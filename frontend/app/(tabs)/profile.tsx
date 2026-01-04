import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PageHeader from '../../components/PageHeader';
import AnimatedCard from '../../components/AnimatedCard';
import { useRouter } from 'expo-router';

const MOCK_BADGES = [
  { id: 'b1', title: 'First Log', subtitle: 'Log your first meal', icon: 'sparkles', earned: true },
  { id: 'b2', title: 'Protein Pro', subtitle: 'Hit protein 3 days', icon: 'fitness', earned: false },
  { id: 'b3', title: 'Streak Starter', subtitle: '3-day streak', icon: 'flame', earned: true },
  { id: 'b4', title: 'Macro Master', subtitle: 'Hit all macros once', icon: 'pie-chart', earned: false },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useUser();
  const { logout: authLogout } = useAuth();

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            authLogout();
            logout();
            router.replace('/intro' as any);
          },
        },
      ]
    );
  };

  const bmi = React.useMemo(() => {
    if (user?.weight && user?.height) {
      const heightInMeters = user.height / 100;
      const val = user.weight / (heightInMeters * heightInMeters);
      return val.toFixed(1);
    }
    return null;
  }, [user?.weight, user?.height]);

  return (
    <View style={styles.container}>
      {/* Header moved outside ScrollView for alignment */}
      <PageHeader 
        title="Profile" 
        subtitle="Manage your account"
      />
      
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* User Info & Social Stats Card */}
        <AnimatedCard delay={100} type="pop" style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
          </View>
          
          <Text style={styles.userName}>{user?.name || 'User'}</Text>
          <Text style={styles.userBio}>Fueling my fitness journey with NutriSnap! 🥗💪</Text>

          <View style={styles.socialStatsRow}>
            <View style={styles.socialStatItem}>
              <Text style={styles.socialStatValue}>124</Text>
              <Text style={styles.socialStatLabel}>Followers</Text>
            </View>
            <View style={styles.socialStatDivider} />
            <View style={styles.socialStatItem}>
              <Text style={styles.socialStatValue}>86</Text>
              <Text style={styles.socialStatLabel}>Following</Text>
            </View>
          </View>
        </AnimatedCard>

        {/* XP & Level Section */}
        <AnimatedCard delay={200} type="pop" style={styles.section}>
          <View style={styles.levelCard}>
            <View style={styles.levelHeader}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>Lvl 5</Text>
              </View>
              <View style={styles.xpInfo}>
                <Text style={styles.xpTitle}>Expert Snapper</Text>
                <Text style={styles.xpSub}>1,240 / 2,000 XP to next level</Text>
              </View>
            </View>
            <View style={styles.xpProgressTrack}>
              <View style={[styles.xpProgressFill, { width: '62%' }]} />
            </View>
          </View>
        </AnimatedCard>

        {/* Stats Cards - Grid format for 4 items */}
        <AnimatedCard delay={300} type="pop" style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user?.weight || 0} kg</Text>
            <Text style={styles.statLabel}>Weight</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user?.height || 0} cm</Text>
            <Text style={styles.statLabel}>Height</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user?.age || 0} yrs</Text>
            <Text style={styles.statLabel}>Age</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{bmi || '--'}</Text>
            <Text style={styles.statLabel}>BMI</Text>
          </View>
        </AnimatedCard>

      <AnimatedCard delay={400} type="slide" style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Badges</Text>
          <Text style={styles.badgeCount}>
            {MOCK_BADGES.filter((b) => b.earned).length}/{MOCK_BADGES.length}
          </Text>
        </View>

        <View style={styles.badgesGrid}>
          {MOCK_BADGES.map((b) => (
            <View key={b.id} style={[styles.badgeCard, !b.earned && styles.badgeCardLocked]}>
              <View style={styles.badgeIconWrap}>
                <Ionicons name={b.icon as any} size={20} color={b.earned ? Colors.primary : Colors.textLight} />
              </View>
              <View style={styles.badgeTextWrap}>
                <Text style={styles.badgeTitle}>{b.title}</Text>
                <Text style={styles.badgeSubtitle}>{b.subtitle}</Text>
              </View>
              {!b.earned && <Ionicons name="lock-closed" size={16} color={Colors.textLight} />}
            </View>
          ))}
        </View>
      </AnimatedCard>

      {/* Daily Targets */}
      <AnimatedCard delay={500} type="slide" style={styles.section}>
        <Text style={styles.sectionTitle}>Daily Targets</Text>
        <View style={styles.targetCard}>
          <View style={styles.targetRow}>
            <View style={styles.targetInfo}>
              <Ionicons name="flame" size={24} color={Colors.accent} />
              <Text style={styles.targetLabel}>Calories</Text>
            </View>
            <Text style={styles.targetValue}>
              {Math.round(user?.daily_calorie_target || 0)} kcal
            </Text>
          </View>
          <View style={styles.targetRow}>
            <View style={styles.targetInfo}>
              <Ionicons name="fitness" size={24} color={Colors.primary} />
              <Text style={styles.targetLabel}>Protein</Text>
            </View>
            <Text style={styles.targetValue}>
              {Math.round(user?.protein_target || 0)}g
            </Text>
          </View>
          <View style={styles.targetRow}>
            <View style={styles.targetInfo}>
              <Ionicons name="leaf" size={24} color={Colors.accent} />
              <Text style={styles.targetLabel}>Carbs</Text>
            </View>
            <Text style={styles.targetValue}>
              {Math.round(user?.carbs_target || 0)}g
            </Text>
          </View>
          <View style={styles.targetRow}>
            <View style={styles.targetInfo}>
              <Ionicons name="water" size={24} color={Colors.primary} />
              <Text style={styles.targetLabel}>Fat</Text>
            </View>
            <Text style={styles.targetValue}>
              {Math.round(user?.fat_target || 0)}g
            </Text>
          </View>
        </View>
      </AnimatedCard>

      {/* Preferences */}
      <AnimatedCard delay={600} type="slide" style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceInfo}>
              <Ionicons name="restaurant" size={20} color={Colors.textSecondary} />
              <Text style={styles.preferenceLabel}>Dietary Preference</Text>
            </View>
            <Text style={styles.preferenceValue}>
              {user?.dietary_preference?.replace('_', ' ')}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceInfo}>
              <Ionicons name="barbell" size={20} color={Colors.textSecondary} />
              <Text style={styles.preferenceLabel}>Activity Level</Text>
            </View>
            <Text style={styles.preferenceValue}>
              {user?.activity_level?.replace('_', ' ')}
            </Text>
          </View>
        </View>
      </AnimatedCard>

      {/* Logout Button */}
      <AnimatedCard delay={700} type="pop" style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </AnimatedCard>

      <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    marginBottom: 24,
    marginTop: 8,
  },
  avatarWrap: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
  },
  userName: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  userBio: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  socialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    width: '100%',
  },
  socialStatItem: {
    alignItems: 'center',
  },
  socialStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
  },
  socialStatLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  socialStatDivider: {
    width: 2,
    height: 30,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  levelCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    marginBottom: 8,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  levelBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    borderBottomWidth: 6,
  },
  levelBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.white,
    textTransform: 'uppercase',
  },
  xpInfo: {
    flex: 1,
  },
  xpTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
  },
  xpSub: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  xpProgressTrack: {
    height: 16,
    backgroundColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  xpProgressFill: {
    height: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 8,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  badgeCount: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 6,
  },
  badgeCardLocked: {
    opacity: 0.5,
    backgroundColor: Colors.backgroundSecondary,
  },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  badgeTextWrap: {
    alignItems: 'center',
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  targetCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  targetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  targetLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  targetValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primary,
  },
  preferenceCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  preferenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preferenceLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  preferenceValue: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  divider: {
    height: 2,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  appDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.error,
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    borderBottomWidth: 6,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});