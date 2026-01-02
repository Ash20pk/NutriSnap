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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useUser();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{user?.name || 'User'}</Text>
        <Text style={styles.goal}>
          {user?.goal.replace('_', ' ').toUpperCase()}
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{user?.weight || 0} kg</Text>
          <Text style={styles.statLabel}>Current Weight</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{user?.height || 0} cm</Text>
          <Text style={styles.statLabel}>Height</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{user?.age || 0} yrs</Text>
          <Text style={styles.statLabel}>Age</Text>
        </View>
      </View>

      {/* Daily Targets */}
      <View style={styles.section}>
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
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.preferenceCard}>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceInfo}>
              <Ionicons name="restaurant" size={20} color={Colors.textSecondary} />
              <Text style={styles.preferenceLabel}>Dietary Preference</Text>
            </View>
            <Text style={styles.preferenceValue}>
              {user?.dietary_preference.replace('_', ' ')}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceInfo}>
              <Ionicons name="barbell" size={20} color={Colors.textSecondary} />
              <Text style={styles.preferenceLabel}>Activity Level</Text>
            </View>
            <Text style={styles.preferenceValue}>
              {user?.activity_level.replace('_', ' ')}
            </Text>
          </View>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoCard}>
          <Text style={styles.appName}>NutriSnap</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDescription}>
            Smart nutrition tracking with AI-powered food recognition and coin calibration
            for accurate portion sizes.
          </Text>
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

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
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.white,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  goal: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
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
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  targetCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    color: Colors.text,
  },
  targetValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  preferenceCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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
    color: Colors.text,
  },
  preferenceValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  appDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.error,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.error,
  },
});