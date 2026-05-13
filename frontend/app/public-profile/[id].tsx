import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Radius } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import PillTabs from '../../components/PillTabs';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { socialApi, questApi, postApi } from '../../utils/api';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POST_SIZE = (SCREEN_WIDTH - 4) / 3;

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
  is_special_user: boolean;
};

export default function PublicProfileScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const params = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const userId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';

  const [profile, setProfile] = useState<PublicUserStats | null>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'badges'>('posts');

  const dicebearUrl = useMemo(() => {
    if (!profile) return null;
    const seed = encodeURIComponent((profile.username || profile.name || profile.id || 'U').trim());
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}`;
  }, [profile]);

  useEffect(() => {
    setAvatarImageFailed(false);
  }, [profile?.avatar_url, dicebearUrl]);

  const xpProgress = useMemo(() => {
    if (!profile) return 0;
    return Math.min(1, (profile.total_xp % 100) / 100);
  }, [profile]);

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setPostsLoading(true);
    try {
      const [res, badgesRes, postsRes] = await Promise.all([
        socialApi.getPublicUserStats(userId),
        questApi.getBadges(userId).catch(() => ({ badges: [] })),
        postApi.getUserPosts(userId).catch(() => ({ posts: [] })),
      ]);
      setProfile({
        ...res,
        is_followed_by_me: !!(res as any)?.is_followed_by_me,
      });
      setBadges(badgesRes.badges || []);
      setPosts(postsRes.posts || []);
    } catch (e) {
      console.error('Error fetching public profile:', e);
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPostsLoading(false);
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
      {/* Instagram-style header */}
      <View style={[styles.instaHeader, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.back(); }}
          style={styles.instaHeaderIcon}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.instaHeaderTitle}>
          {profile?.username ? `@${profile.username}` : profile?.name || 'Profile'}
        </Text>
        <View style={styles.instaHeaderIcon} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProfile(); }} tintColor={theme.primary} />
        }
      >
        {loading ? (
          <LoadingState label="Loading profile..." style={{ marginTop: 60 }} />
        ) : !profile ? (
          <EmptyState icon="alert-circle-outline" title="Unable to load" subtitle="Pull to refresh or try again." style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Avatar row */}
            <View style={styles.profileAvatarRow}>
              <View style={styles.profileAvatarWrap}>
                <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={104} height={104} style={{ position: 'absolute' }}>
                    <Circle cx={52} cy={52} r={48} stroke={theme.border} strokeWidth={6} fill={theme.backgroundSecondary} />
                    <Circle
                      cx={52} cy={52} r={48}
                      stroke={Colors.warning} strokeWidth={6} fill="none"
                      strokeDasharray={2 * Math.PI * 48}
                      strokeDashoffset={2 * Math.PI * 48 * (1 - xpProgress)}
                      strokeLinecap="round"
                      transform="rotate(-90 52 52)"
                    />
                  </Svg>
                  <View style={styles.profileAvatarInner}>
                    {(profile.avatar_url || dicebearUrl) && !avatarImageFailed ? (
                      <Image
                        source={{ uri: (profile.avatar_url || dicebearUrl) as string }}
                        style={styles.profileAvatarImg}
                        onError={() => setAvatarImageFailed(true)}
                      />
                    ) : (
                      <Text style={styles.profileAvatarInitial}>
                        {(profile.name || profile.username || 'U')[0]?.toUpperCase() || 'U'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{profile.level}</Text>
                </View>
              </View>

              {/* Follow button */}
              <TouchableOpacity
                style={[styles.followBtn, profile.is_followed_by_me && styles.followBtnActive]}
                onPress={handleToggleFollow}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                {followLoading ? (
                  <ActivityIndicator size="small" color={profile.is_followed_by_me ? theme.text : theme.white} />
                ) : (
                  <Text style={[styles.followBtnText, profile.is_followed_by_me && styles.followBtnTextActive]}>
                    {profile.is_followed_by_me ? 'Following' : 'Follow'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Name / bio */}
            <View style={styles.profileInfo}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName}>{profile.name || 'User'}</Text>
                {profile.is_special_user && (
                  <View style={styles.specialBadge}>
                    <Ionicons name="heart" size={10} color={theme.white} />
                    <Text style={styles.specialBadgeText}>Special</Text>
                  </View>
                )}
              </View>
              {profile.bio
                ? <Text style={styles.profileBio}>{profile.bio}</Text>
                : null}
              <Text style={styles.profileXp}>{profile.total_xp} XP · {profile.current_streak} day streak 🔥</Text>
            </View>

            {/* Stats bar */}
            <View style={styles.profileStatsRow}>
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{profile.followers_count}</Text>
                <Text style={styles.profileStatLabel}>Followers</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{profile.following_count}</Text>
                <Text style={styles.profileStatLabel}>Following</Text>
              </View>
              <View style={styles.profileStatDivider} />
              <View style={styles.profileStatItem}>
                <Text style={styles.profileStatValue}>{posts.length}</Text>
                <Text style={styles.profileStatLabel}>Posts</Text>
              </View>
            </View>

            {/* Divider + Tabs */}
            <View style={styles.cardDivider} />
            <View style={styles.tabsWrapper}>
              <PillTabs
                tabs={[
                  { key: 'posts', label: `Posts${posts.length > 0 ? ` (${posts.length})` : ''}` },
                  { key: 'badges', label: `Badges (${badges.filter(b => b.earned).length}/${badges.length})` },
                ]}
                activeKey={activeTab}
                onChange={setActiveTab}
              />
            </View>

            {/* Tab content */}
            <View style={[styles.tabContent, activeTab === 'posts' && { paddingHorizontal: 0 }]}>
              {activeTab === 'posts' ? (
                postsLoading ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 32 }} />
                ) : posts.length > 0 ? (
                  <View style={styles.postsGrid}>
                    {posts.map((post) => {
                      const photoUri = post.media?.[0]?.media_url;
                      return (
                        <TouchableOpacity
                          key={post.id}
                          style={styles.postThumbnail}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            const index = posts.findIndex(p => p.id === post.id);
                            router.push({ pathname: `/post/${post.id}` as any, params: { posts: JSON.stringify(posts), initialIndex: String(index) } });
                          }}
                        >
                          {photoUri ? (
                            <Image source={{ uri: photoUri }} style={styles.postImage} />
                          ) : (
                            <View style={[styles.postPlaceholder, { backgroundColor: post.post_type === 'streak' ? '#FF6B3520' : post.post_type === 'xp_level' ? '#5B6AF020' : post.post_type === 'badge' ? '#F5C51820' : '#2F593E20' }]}>
                              <Text style={{ fontSize: 28 }}>
                                {post.post_type === 'badge' ? (post.metadata?.badge_icon ?? '🏅') : post.post_type === 'streak' ? '🔥' : post.post_type === 'xp_level' ? '⚡' : '🎯'}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="images-outline" size={44} color={theme.textLight} />
                    <Text style={styles.emptyStateText}>No posts yet.</Text>
                  </View>
                )
              ) : (
                badges.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="medal-outline" size={44} color={theme.textLight} />
                    <Text style={styles.emptyStateText}>No badges yet.</Text>
                  </View>
                ) : (
                  <View style={[styles.badgesGrid, { paddingHorizontal: 16 }]}>
                    {badges.map((b) => (
                      <View key={b.id} style={[styles.badgeCard, !b.earned && styles.badgeCardLocked]}>
                        <View style={styles.badgeIconWrap}>
                          <Ionicons name={b.icon as any} size={20} color={b.earned ? theme.primary : theme.textLight} />
                        </View>
                        <View style={styles.badgeTextWrap}>
                          <Text style={styles.badgeTitle}>{b.title}</Text>
                          <Text style={styles.badgeSubtitle} numberOfLines={2}>{b.description}</Text>
                        </View>
                        {!b.earned && <Ionicons name="lock-closed" size={16} color={theme.textLight} />}
                      </View>
                    ))}
                  </View>
                )
              )}
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
    contentContainer: {
      paddingBottom: 100,
    },
    instaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    instaHeaderIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    instaHeaderTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
    },
    profileAvatarRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginTop: 16,
      marginBottom: 12,
    },
    profileAvatarWrap: {
      position: 'relative',
    },
    profileAvatarInner: {
      width: 92,
      height: 92,
      borderRadius: 46,
      overflow: 'hidden',
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
      top: 6,
      left: 6,
    },
    profileAvatarImg: {
      width: '100%',
      height: '100%',
    },
    profileAvatarInitial: {
      fontSize: 34,
      fontWeight: '900',
      color: theme.text,
    },
    levelBadge: {
      position: 'absolute',
      bottom: -6,
      alignSelf: 'center',
      backgroundColor: Colors.warning,
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.white,
    },
    levelBadgeText: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.white,
    },
    followBtn: {
      marginTop: 12,
      paddingHorizontal: 24,
      paddingVertical: 8,
      borderRadius: Radius.xl,
      backgroundColor: theme.primary,
      borderWidth: 1.5,
      borderColor: theme.primary,
      borderBottomWidth: 4,
      minWidth: 110,
      alignItems: 'center',
      justifyContent: 'center',
    },
    followBtnActive: {
      backgroundColor: theme.white,
      borderColor: theme.border,
    },
    followBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.white,
    },
    followBtnTextActive: {
      color: theme.text,
    },
    profileInfo: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    profileNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    profileName: {
      fontSize: 22,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -0.3,
    },
    specialBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    specialBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: theme.white,
      textTransform: 'uppercase',
    },
    profileBio: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
      fontWeight: '500',
      marginBottom: 6,
    },
    profileXp: {
      fontSize: 13,
      color: theme.textSecondary,
      fontWeight: '600',
    },
    profileStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.cardBackground,
      borderRadius: Radius.xl,
      borderWidth: 1.5,
      borderColor: theme.border,
      marginBottom: 14,
      marginHorizontal: 16,
      paddingVertical: 10,
    },
    profileStatItem: {
      flex: 1,
      alignItems: 'center',
    },
    profileStatValue: {
      fontSize: 20,
      fontWeight: '900',
      color: theme.text,
    },
    profileStatLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginTop: 1,
    },
    profileStatDivider: {
      width: 1.5,
      height: 30,
      backgroundColor: theme.border,
    },
    cardDivider: {
      height: 1.5,
      backgroundColor: theme.border,
      marginTop: 4,
    },
    tabsWrapper: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    tabContent: {
      paddingBottom: 20,
    },
    postsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 2,
    },
    postThumbnail: {
      width: POST_SIZE,
      height: POST_SIZE,
    },
    postImage: {
      width: '100%',
      height: '100%',
    },
    postPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 36,
      gap: 10,
    },
    emptyStateText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.textSecondary,
    },
    badgesGrid: {
      gap: 10,
    },
    badgeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.white,
      borderRadius: Radius.xxl,
      padding: 14,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
      gap: 12,
    },
    badgeCardLocked: {
      opacity: 0.45,
    },
    badgeIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 3,
    },
    badgeTextWrap: {
      flex: 1,
    },
    badgeTitle: {
      fontSize: 14,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 2,
    },
    badgeSubtitle: {
      fontSize: 12,
      color: theme.textSecondary,
      fontWeight: '600',
    },
  });
}
