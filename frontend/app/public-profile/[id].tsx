import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '../../components/PageHeader';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { socialApi } from '../../utils/api';
import * as Haptics from 'expo-haptics';

type PublicUserStats = {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  total_xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  quests_completed: number;
  badges_earned: number;
  followers_count: number;
  following_count: number;
  is_followed_by_me: boolean;
};

export default function PublicProfileScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const params = useLocalSearchParams();
  const router = useRouter();

  const userId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [profile, setProfile] = useState<PublicUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);

  const dicebearUrl = useMemo(() => {
    if (!profile) return null;
    const seed = encodeURIComponent((profile.username || profile.name || profile.id || 'U').trim());
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}`;
  }, [profile]);

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [profile?.avatar_url, dicebearUrl]);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await socialApi.getPublicUserStats(userId);
      setProfile({
        ...res,
        is_followed_by_me: !!(res as any)?.is_followed_by_me,
      });
    } catch (e) {
      console.error('Error fetching public profile:', e);
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [fetchProfile]);

  const handleToggleFollow = useCallback(async () => {
    if (!profile?.id || followLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    const nextFollow = !profile.is_followed_by_me;
    setFollowLoading(true);
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        is_followed_by_me: nextFollow,
        followers_count: Math.max(0, prev.followers_count + (nextFollow ? 1 : -1)),
      };
    });

    try {
      if (nextFollow) {
        await socialApi.followUser(profile.id);
      } else {
        await socialApi.unfollowUser(profile.id);
      }
      await fetchProfile();
    } catch (e) {
      console.error('Error toggling follow:', e);
      await fetchProfile();
    } finally {
      setFollowLoading(false);
    }
  }, [fetchProfile, followLoading, profile]);

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
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        }
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchProfile();
            }}
            tintColor={theme.primary}
          />
        }
      >
        {loading ? (
          <LoadingState label="Loading profile..." />
        ) : !profile ? (
          <View style={{ paddingTop: 24 }}>
            <EmptyState
              icon="alert-circle-outline"
              title="Unable to load"
              subtitle="Pull to refresh or try again later."
            />
          </View>
        ) : (
          <>
            <AnimatedCard delay={100} type="pop" style={styles.profileCard}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  {!avatarImageFailed ? (
                    <Image
                      source={{ uri: profile.avatar_url || (dicebearUrl as string) }}
                      style={{ width: '100%', height: '100%', borderRadius: 36 }}
                      onError={() => setAvatarImageFailed(true)}
                    />
                  ) : (
                    <Text style={styles.avatarText}>
                      {(profile.name || profile.username || 'U')[0]?.toUpperCase() || 'U'}
                    </Text>
                  )}
                </View>
              </View>

              <Text style={styles.userName}>{profile.name || 'User'}</Text>
              {profile.username ? (
                <Text style={styles.usernameText}>@{profile.username}</Text>
              ) : null}
              {profile.bio ? <Text style={styles.userBio}>{profile.bio}</Text> : null}

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{profile.followers_count}</Text>
                  <Text style={styles.statLabel}>Followers</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{profile.following_count}</Text>
                  <Text style={styles.statLabel}>Following</Text>
                </View>
              </View>

              <DuoButton
                title={profile.is_followed_by_me ? 'Unfollow' : 'Follow'}
                onPress={handleToggleFollow}
                loading={followLoading}
                color={profile.is_followed_by_me ? theme.white : theme.primary}
                shadowColor={profile.is_followed_by_me ? theme.border : undefined}
                textStyle={{ color: profile.is_followed_by_me ? theme.text : theme.white }}
                size="large"
                style={styles.followButton}
              />
            </AnimatedCard>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stats</Text>
              <AnimatedCard delay={200} type="slide">
                <View style={styles.recipeCard}>
                  <View style={styles.recipeIconWrap}>
                    <Ionicons name="trophy" size={24} color={theme.primary} />
                  </View>
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeName}>Level {profile.level}</Text>
                    <Text style={styles.recipeMeta}>{profile.total_xp} XP • {profile.badges_earned} badges</Text>
                  </View>
                </View>
              </AnimatedCard>
              <AnimatedCard delay={300} type="slide">
                <View style={styles.recipeCard}>
                  <View style={styles.recipeIconWrap}>
                    <Ionicons name="flame" size={24} color={Colors.warning} />
                  </View>
                  <View style={styles.recipeInfo}>
                    <Text style={styles.recipeName}>Streak</Text>
                    <Text style={styles.recipeMeta}>{profile.current_streak} current • {profile.longest_streak} best</Text>
                  </View>
                </View>
              </AnimatedCard>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shared Recipes</Text>
              <EmptyState
                icon="restaurant"
                title="No shared recipes yet"
                subtitle="This section will appear when recipe sharing is enabled."
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Badges</Text>
              <EmptyState
                icon="ribbon-outline"
                title="No badges to show"
                subtitle="This section will appear when public badges are enabled."
              />
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
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
    backgroundColor: theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  profileCard: {
    backgroundColor: theme.white,
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
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
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.border,
    borderBottomWidth: 10,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '900',
    color: theme.text,
  },
  userName: {
    fontSize: 26,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  usernameText: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  userBio: {
    fontSize: 15,
    color: theme.textSecondary,
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
    color: theme.text,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 2,
    height: 36,
    backgroundColor: theme.border,
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
    color: theme.text,
    marginBottom: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderRadius: 28,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  recipeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  recipeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  recipeName: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
  },
  recipeMeta: {
    fontSize: 13,
    color: theme.textSecondary,
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
    backgroundColor: theme.white,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.border,
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
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
    marginBottom: 4,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
    textAlign: 'center',
  },
  });
}
