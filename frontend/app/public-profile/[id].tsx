import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../components/PageHeader';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import * as Haptics from 'expo-haptics';

const MOCK_RECIPES = [
  { id: 'r1', name: 'High Protein Oats', calories: 350, protein: 25 },
  { id: 'r2', name: 'Chicken Quinoa Bowl', calories: 450, protein: 35 },
];

const MOCK_BADGES = [
  { id: 'b1', title: 'First Log', icon: 'sparkles', earned: true },
  { id: 'b3', title: 'Streak Starter', icon: 'flame', earned: true },
];

export default function PublicProfileScreen() {
  const { name } = useLocalSearchParams();
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(false);

  return (
    <View style={styles.container}>
      <PageHeader 
        title="Profile" 
        subtitle="View user details"
        rightComponent={
          <TouchableOpacity 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.back();
            }} 
            style={styles.closeButton}
            activeOpacity={0.9}
          >
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <AnimatedCard delay={100} type="pop" style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(name as string)?.[0]?.toUpperCase() || 'U'}</Text>
            </View>
          </View>
          
          <Text style={styles.userName}>{name || 'User'}</Text>
          <Text style={styles.userBio}>Fueling my fitness journey with NutriSnap! 🥗💪</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>124</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>86</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>

          <DuoButton
            title={isFollowing ? 'Unfollow' : 'Follow'}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              setIsFollowing(!isFollowing);
            }}
            color={isFollowing ? Colors.white : Colors.primary}
            shadowColor={isFollowing ? Colors.border : undefined}
            textStyle={{ color: isFollowing ? Colors.text : Colors.white }}
            size="large"
            style={styles.followButton}
          />
        </AnimatedCard>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shared Recipes</Text>
          {MOCK_RECIPES.map((recipe, index) => (
            <AnimatedCard key={recipe.id} delay={200 + index * 100} type="slide">
              <TouchableOpacity 
                style={styles.recipeCard} 
                activeOpacity={0.9}
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
              >
                <View style={styles.recipeIconWrap}>
                  <Ionicons name="restaurant" size={24} color={Colors.primary} />
                </View>
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeName}>{recipe.name}</Text>
                  <Text style={styles.recipeMeta}>{recipe.calories} kcal • {recipe.protein}g protein</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            </AnimatedCard>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Badges</Text>
          <View style={styles.badgesGrid}>
            {MOCK_BADGES.map((b, index) => (
              <AnimatedCard key={b.id} delay={400 + index * 100} type="pop" style={styles.badgeCardWrapper}>
                <View style={styles.badgeCard}>
                  <View style={styles.badgeIconWrap}>
                    <Ionicons name={b.icon as any} size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.badgeTitle}>{b.title}</Text>
                </View>
              </AnimatedCard>
            ))}
          </View>
        </View>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 10,
    marginTop: 16,
  },
  avatarWrap: {
    marginBottom: 20,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 36,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: 10,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.text,
  },
  userName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  userBio: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 28,
    width: '100%',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 2,
    height: 36,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  followButton: {
    width: '100%',
    marginTop: 8,
  },
  section: {
    marginTop: 36,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  recipeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  recipeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  recipeName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
  },
  recipeMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  badgeCardWrapper: {
    width: '47.5%',
  },
  badgeCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 8,
  },
  badgeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
    marginBottom: 4,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
  },
});
