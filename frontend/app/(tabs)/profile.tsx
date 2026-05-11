import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PillTabs from '../../components/PillTabs';
import CreatePostSheet from '../../components/CreatePostSheet';
import { useRouter } from 'expo-router';
import { questApi, socialApi, postApi, userApi } from '../../utils/api';

interface QuestBadge {
  id: string;
  name?: string;
  title?: string;
  description: string;
  icon: string;
  xp?: number;
  tier?: number;
  earned?: boolean;
  earned_at?: string;
}

interface QuestStats {
  total_xp: number;
  level: number;
  xp_for_next_level?: number;
  xp_to_next_level?: number;
  current_streak: number;
  longest_streak: number;
  quests_completed?: number;
  badges_earned: number;
}

export default function ProfileScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const { user, setUser } = useUser();
  const { logout: authLogout } = useAuth();
  const insets = useSafeAreaInsets();

  const [avatarImageFailed, setAvatarImageFailed] = React.useState(false);
  const didPersistAvatarRef = React.useRef(false);

  const dicebearAvatarUrl = React.useMemo(() => {
    if (!user?.id) return null;
    const seed = encodeURIComponent((user.username || user.name || user.id || 'U').trim());
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}`;
  }, [user?.id, user?.name, user?.username]);

  const resolvedAvatarUrl = user?.avatar_url || dicebearAvatarUrl;

  React.useEffect(() => {
    setAvatarImageFailed(false);
  }, [resolvedAvatarUrl]);

  React.useEffect(() => {
    if (!user?.id) return;
    if (user.avatar_url) return;
    if (!dicebearAvatarUrl) return;
    if (didPersistAvatarRef.current) return;
    didPersistAvatarRef.current = true;

    // Persist a stable DiceBear avatar URL once so it doesn't change between sessions
    // until the user uploads/changes their photo.
    userApi
      .updateMyProfile({ avatar_url: dicebearAvatarUrl })
      .then((res) => {
        setUser({
          ...user,
          avatar_url: res.avatar_url ?? dicebearAvatarUrl,
        });
      })
      .catch((e) => {
        console.error('Failed to persist avatar_url:', e);
        // allow retry later
        didPersistAvatarRef.current = false;
      });
  }, [dicebearAvatarUrl, setUser, user]);

  const [stats, setStats] = React.useState<QuestStats | null>(null);
  const [badges, setBadges] = React.useState<QuestBadge[]>([]);
  const [followersCount, setFollowersCount] = React.useState(0);
  const [followingCount, setFollowingCount] = React.useState(0);
  const [userPosts, setUserPosts] = React.useState<any[]>([]);
  const [postsLoading, setPostsLoading] = React.useState(false);

  const [profileRefreshLoading, setProfileRefreshLoading] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const [showCreatePost, setShowCreatePost] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'posts' | 'badges'>('posts');

  const xpProgress = React.useMemo(() => {
    if (!stats) return 0;
    if (stats.xp_to_next_level != null && stats.xp_for_next_level) {
      return Math.min(1, Math.max(0, (stats.xp_for_next_level - stats.xp_to_next_level) / stats.xp_for_next_level));
    }
    return 0;
  }, [stats]);

  const refreshProfileData = React.useCallback(async () => {
    if (!user?.id) return;
    setProfileRefreshLoading(true);
    setPostsLoading(true);
    try {
      const [statsRes, badgesRes, followersRes, followingRes, postsRes] = await Promise.all([
        questApi.getStats(user.id),
        questApi.getBadges(user.id),
        socialApi.getMyFollowers(),
        socialApi.getMyFollowing(),
        postApi.getUserPosts(user.id).catch(() => ({ posts: [] })),
      ]);
      setStats(statsRes);
      setBadges(badgesRes.badges || []);
      setFollowersCount((followersRes.followers || []).length);
      setFollowingCount((followingRes.following || []).length);
      setUserPosts(postsRes.posts || []);
    } catch (e) {
      console.error('Error loading profile data:', e);
    } finally {
      setProfileRefreshLoading(false);
      setPostsLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    refreshProfileData();
  }, [refreshProfileData]);

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
            router.replace('/intro' as any);
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, all meal logs, badges, and progress. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Type "delete" to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await userApi.deleteAccount();
                      await authLogout();
                      router.replace('/intro' as any);
                    } catch (e: any) {
                      Alert.alert('Error', e?.message ?? 'Failed to delete account. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <CreatePostSheet
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={refreshProfileData}
      />
      
      {/* Insta-style Header */}
      <View style={[styles.instaHeader, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowCreatePost(true); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.instaHeaderIcon}
        >
          <Ionicons name="add-circle-outline" size={28} color={theme.text} />
        </TouchableOpacity>
        
        <Text style={styles.instaHeaderTitle}>{user?.username ? `@${user.username}` : 'Profile'}</Text>
        
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowMenu(true); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.instaHeaderIcon}
        >
          <Ionicons name="menu-outline" size={30} color={theme.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profileRefreshLoading}
            onRefresh={refreshProfileData}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {/* ── Unified profile + feed card ── */}
        <View style={styles.profileCard}>

          {/* Avatar row */}
          <View style={styles.profileAvatarRow}>
            <View style={styles.profileAvatarWrap}>
              <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={104} height={104} style={{ position: 'absolute' }}>
                  <Circle
                    cx={52} cy={52} r={48}
                    stroke={theme.border}
                    strokeWidth={6}
                    fill={theme.backgroundSecondary}
                  />
                  <Circle
                    cx={52} cy={52} r={48}
                    stroke={Colors.warning}
                    strokeWidth={6}
                    fill="none"
                    strokeDasharray={2 * Math.PI * 48}
                    strokeDashoffset={2 * Math.PI * 48 * (1 - xpProgress)}
                    strokeLinecap="round"
                    transform="rotate(-90 52 52)"
                  />
                </Svg>
                <View style={styles.profileAvatarInner}>
                  {resolvedAvatarUrl && !avatarImageFailed ? (
                    <Image
                      source={{ uri: resolvedAvatarUrl.toString() }}
                      style={styles.profileAvatarImg}
                      onError={() => setAvatarImageFailed(true)}
                    />
                  ) : (
                    <Text style={styles.profileAvatarInitial}>
                      {(user?.name || user?.username || 'U')[0]?.toUpperCase() || 'U'}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>{stats?.level ?? 1}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/edit-profile'); }}
            >
              <Ionicons name="create-outline" size={15} color={theme.primary} />
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Name / username / bio */}
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName}>{user?.name || 'User'}</Text>
              {user?.is_special_user && (
                <View style={styles.specialBadge}>
                  <Ionicons name="heart" size={10} color={theme.white} />
                  <Text style={styles.specialBadgeText}>Special</Text>
                </View>
              )}
            </View>
            {user?.bio
              ? <Text style={styles.profileBio}>{user.bio}</Text>
              : <Text style={styles.profileBioMuted}>No bio yet · tap Edit to add one</Text>
            }
          </View>

          {/* Stats bar */}
          <View style={styles.profileStatsRow}>
            <TouchableOpacity style={styles.profileStatItem} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/followers' as any); }}>
              <Text style={styles.profileStatValue}>{followersCount}</Text>
              <Text style={styles.profileStatLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.profileStatDivider} />
            <TouchableOpacity style={styles.profileStatItem} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/following' as any); }}>
              <Text style={styles.profileStatValue}>{followingCount}</Text>
              <Text style={styles.profileStatLabel}>Following</Text>
            </TouchableOpacity>
            <View style={styles.profileStatDivider} />
            <View style={styles.profileStatItem}>
              <Text style={styles.profileStatValue}>{userPosts.length}</Text>
              <Text style={styles.profileStatLabel}>Posts</Text>
            </View>
          </View>

          {/* ── Divider ── */}
          <View style={styles.cardDivider} />

          {/* Tabs */}
          <View style={styles.tabsWrapper}>
            <PillTabs
              tabs={[
                { key: 'posts', label: `Posts${userPosts.length > 0 ? ` (${userPosts.length})` : ''}` },
                { key: 'badges', label: `Badges (${badges.filter(b => b.earned).length}/${badges.length})` },
              ]}
              activeKey={activeTab}
              onChange={setActiveTab}
            />
          </View>

          {/* Tab content */}
          <View style={[styles.tabContent, activeTab === 'posts' && { paddingHorizontal: 16 }]}>
            {activeTab === 'posts' ? (
              postsLoading ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 32 }} />
              ) : userPosts.length > 0 ? (
                <View style={styles.postsGrid}>
                  {userPosts.map((post) => {
                    const photoUri = post.media[0]?.media_url;
                    return (
                      <TouchableOpacity
                        key={post.id}
                        style={styles.postThumbnail}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          router.push({ pathname: `/post/${post.id}` as any, params: { post: JSON.stringify(post) } });
                        }}
                      >
                        {photoUri ? (
                          <Image source={{ uri: photoUri }} style={styles.postImage} />
                        ) : (
                          <View style={[styles.postPlaceholder, { backgroundColor: theme.primary + '20' }]}>
                            <Ionicons name={post.post_type === 'badge' ? 'medal' : 'flash'} size={24} color={theme.primary} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="images-outline" size={44} color={theme.textLight} />
                  <Text style={styles.emptyStateText}>No posts yet. Start sharing!</Text>
                </View>
              )
            ) : (
              badges.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="medal-outline" size={44} color={theme.textLight} />
                  <Text style={styles.emptyStateText}>No badges yet. Keep going!</Text>
                </View>
              ) : (
                <View style={styles.badgesGrid}>
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

        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Three-dot menu sheet ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={[styles.menuSheet, { backgroundColor: theme.white }]}>
            <View style={styles.menuHandle} />

            {/* Settings */}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.75} onPress={() => { setShowMenu(false); router.push('/settings' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="settings-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Settings</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

            {/* Saved Posts */}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.75} onPress={() => { setShowMenu(false); router.push('/saved-posts' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="bookmark-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Saved Posts</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

            {/* Redeem Code */}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.75} onPress={() => { setShowMenu(false); router.push('/redeem' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="gift-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>
                {user?.is_special_user ? '🌸 Special Access' : 'Redeem a Code'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

            {/* Privacy Policy */}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.75} onPress={() => { setShowMenu(false); router.push('/privacy-policy' as any); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.primary + '18' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.text }]}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

            {/* Log Out */}
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.75} onPress={() => { setShowMenu(false); handleLogout(); }}>
              <View style={[styles.menuIcon, { backgroundColor: theme.error + '15' }]}>
                <Ionicons name="log-out-outline" size={20} color={theme.error} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.error }]}>Log Out</Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity style={[styles.menuRow, styles.menuCancel, { borderTopColor: theme.border }]} activeOpacity={0.75} onPress={() => setShowMenu(false)}>
              <Text style={[styles.menuCancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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

  // ── Unified profile card ──
  profileCard: {
    backgroundColor: theme.background,
    flex: 1,
    minHeight: '100%',
    borderWidth: 0,
    borderBottomWidth: 0,
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
  profileAvatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.white,
  },
  profileAvatarRingPlain: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.white,
    overflow: 'hidden',
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
  profileAvatarEditBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.primary,
    borderWidth: 2,
    borderColor: theme.white,
    alignItems: 'center',
    justifyContent: 'center',
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
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: theme.primary,
    borderRadius: Radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 12,
    backgroundColor: theme.white,
  },
  editProfileBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.primary,
  },
  profileInfo: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  profileUsername: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
    marginBottom: 10,
  },
  profileUsernameMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textLight,
    marginBottom: 10,
  },
  profileBio: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 14,
  },
  profileBioMuted: {
    fontSize: 13,
    color: theme.textLight,
    fontWeight: '500',
    fontStyle: 'italic',
    marginBottom: 14,
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
  menuBtn: {
    padding: 4,
  },
  // Menu sheet
  menuBackdrop: {
    flex: 1,
    backgroundColor: theme.shadowDark,
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 36,
    paddingTop: 8,
    borderTopWidth: 2,
    borderColor: theme.borderSubtle,
  },
  menuHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.border, alignSelf: 'center', marginBottom: 14,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  menuIcon: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    marginLeft: 74,
    marginRight: 20,
  },
  menuCancel: {
    justifyContent: 'center',
    borderTopWidth: 1,
    marginTop: 8,
  },
  menuCancelText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
  },
  modalCloseBtn: {
    width: Radius.round,
    height: Radius.round,
    borderRadius: Radius.xxl,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
  },
  modalAvatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  avatarEditContainer: {
    position: 'relative',
    marginBottom: Spacing.sm,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -4,
    bottom: 4,
    backgroundColor: theme.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  changePhotoHint: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.primary,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: Spacing.xxl,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs + 2,
    marginLeft: 4,
    letterSpacing: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.border,
    paddingHorizontal: Spacing.lg,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.primary,
    marginRight: Spacing.xs,
  },
  textInput: {
    flex: 1,
    height: 52,
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
  },
  inputHint: {
    fontSize: 12,
    color: theme.textLight,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: '600',
  },
  bioInputWrapper: {
    alignItems: 'flex-start',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  bioTextInput: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
  charCount: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'right',
    marginTop: Spacing.xs,
    fontWeight: '700',
  },
  xpInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 0,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.border,
    padding: 12,
  },
  xpInlineBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 14,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 4,
    borderColor: theme.borderSubtle,
    borderWidth: 2,
  },
  xpInlineLvl: {
    fontSize: 16,
  },
  xpInlineLvlNum: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.white,
    lineHeight: 14,
  },
  xpBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpInlineLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.text,
  },
  xpInlineInfo: {
    flex: 1,
    gap: 0,
  },
  xpInlineSub: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  xpProgressTrack: {
    height: 10,
    backgroundColor: theme.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  xpProgressFill: {
    height: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 5,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.white,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: theme.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weightChartSub: {
    fontSize: 11,
    color: theme.textSecondary,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
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
    overflow: 'hidden',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.background,
    borderTopLeftRadius: Radius.xxxxl,
    borderTopRightRadius: Radius.xxxxl,
    borderWidth: 2,
    borderColor: theme.border,
    maxHeight: '90%',
    flexShrink: 1,
    width: '100%',
    elevation: 20,
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: theme.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.text,
    letterSpacing: -0.5,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.primary,
    paddingHorizontal: 8,
  },
  modalScroll: {
    flexGrow: 1,
  },
  modalContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xl,
  },
  badgeCount: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.primary,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: theme.backgroundSecondary,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: theme.border,
    padding: Spacing.lg - 2,
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    borderBottomWidth: 4,
  },
  badgeCardLocked: {
    opacity: 0.5,
    backgroundColor: theme.backgroundSecondary,
  },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.xxl,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    marginBottom: Spacing.xs,
  },
  badgeTextWrap: {
    alignItems: 'center',
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: Colors.error,
    borderRadius: Radius.xl,
    padding: Spacing.lg + 2,
    marginTop: Spacing.sm,
    borderBottomWidth: 6,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dangerRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: theme.textSecondary,
  },
  dangerDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: Spacing.sm,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  redeemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  redeemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  savedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    borderRadius: 16,
    overflow: 'hidden',
  },
  postThumbnail: {
    width: '32.4%',
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: theme.backgroundSecondary,
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
  });
}