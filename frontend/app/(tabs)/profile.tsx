import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import PageHeader from '../../components/PageHeader';
import AnimatedCard from '../../components/AnimatedCard';
import SectionTitle from '../../components/SectionTitle';
import AppCard from '../../components/AppCard';
import DuoButton from '../../components/DuoButton';
import ProfileRow from '../../components/ProfileRow';
import { useRouter } from 'expo-router';
import { questApi, socialApi, userApi } from '../../utils/api';

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
  const router = useRouter();
  const { user, setUser, logout } = useUser();
  const { logout: authLogout } = useAuth();

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

  const [editVisible, setEditVisible] = React.useState(false);
  const [editUsernameDraft, setEditUsernameDraft] = React.useState('');
  const [editBioDraft, setEditBioDraft] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);

  React.useEffect(() => {
    setEditUsernameDraft((user?.username || '').toString());
    setEditBioDraft((user?.bio || '').toString());
  }, [user?.username, user?.bio]);

  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.all([
      questApi.getStats(user.id),
      questApi.getBadges(user.id),
      socialApi.getMyFollowers(),
      socialApi.getMyFollowing(),
    ])
      .then(([statsRes, badgesRes, followersRes, followingRes]) => {
        if (cancelled) return;
        setStats(statsRes);
        setBadges(badgesRes.badges || []);
        setFollowersCount((followersRes.followers || []).length);
        setFollowingCount((followingRes.following || []).length);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('Error loading profile data:', e);
      })
      .finally(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
        {/* Unified Profile Header - Centered Layout */}
        <AnimatedCard delay={100} type="pop" style={styles.section}>
          <AppCard padding={24}>
            <View style={styles.headerCentered}>
              <View style={styles.avatarContainerLarge}>
                <View style={styles.avatarLarge}>
                  {!avatarImageFailed && resolvedAvatarUrl ? (
                    <Image
                      source={{ uri: resolvedAvatarUrl }}
                      style={{ width: '100%', height: '100%', borderRadius: 36 }}
                      onError={() => setAvatarImageFailed(true)}
                    />
                  ) : (
                    <Text style={styles.avatarTextLarge}>
                      {user?.name?.[0]?.toUpperCase() || 'U'}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.editBadgeLarge}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setEditVisible(true);
                  }}
                >
                  <Ionicons name="pencil" size={16} color={Colors.white} />
                </TouchableOpacity>
              </View>

              <Text style={styles.userNameLarge}>{user?.name || 'User'}</Text>
              {user?.username ? (
                <Text style={styles.usernameTextLarge}>@{user.username}</Text>
              ) : (
                <Text style={styles.usernameTextMutedLarge}>No username set</Text>
              )}

              <View style={styles.socialStatsRowCentered}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    router.push('/followers' as any);
                  }}
                  style={styles.statItemCentered}
                >
                  <Text style={styles.statValueCentered}>{followersCount}</Text>
                  <Text style={styles.statLabelCentered}>Followers</Text>
                </TouchableOpacity>
                <View style={styles.statDividerCentered} />
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    router.push('/following' as any);
                  }}
                  style={styles.statItemCentered}
                >
                  <Text style={styles.statValueCentered}>{followingCount}</Text>
                  <Text style={styles.statLabelCentered}>Following</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bioSection}>
                <Text style={styles.bioText}>
                  {user?.bio || 'No bio yet. Tap edit to add one! 📝'}
                </Text>
              </View>

              <DuoButton
                title="Edit Profile"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setEditVisible(true);
                }}
                color={Colors.primary}
                size="large"
                style={{ width: '100%', marginTop: 8 }}
                leftIcon={<Ionicons name="create-outline" size={18} color={Colors.white} />}
              />
            </View>
          </AppCard>
        </AnimatedCard>

        <Modal
          visible={editVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setEditVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalSheet}
            >
              {/* Drag Handle */}
              <View style={styles.modalDragHandle} />

              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setEditVisible(false);
                  }}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <View style={{ width: 40 }} />
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalContent}>
                  <View style={styles.modalAvatarSection}>
                    <View style={styles.avatarEditContainer}>
                      <View style={styles.avatarLarge}>
                        {!avatarImageFailed && resolvedAvatarUrl ? (
                          <Image
                            source={{ uri: resolvedAvatarUrl }}
                            style={{ width: '100%', height: '100%', borderRadius: Radius.xxxxl }}
                          />
                        ) : (
                          <Text style={styles.avatarTextLarge}>{user?.name?.[0]?.toUpperCase() || 'U'}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.avatarEditBadge}
                        onPress={() => Alert.alert('Coming soon', 'Profile photo uploading will be added next.')}
                      >
                        <Ionicons name="camera" size={18} color={Colors.white} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.changePhotoHint}>Tap to change photo</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Username</Text>
                    <View style={styles.inputWrapper}>
                      <Text style={styles.inputPrefix}>@</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editUsernameDraft}
                        onChangeText={(t) => setEditUsernameDraft(t.toLowerCase().replace(/\s/g, ''))}
                        placeholder="your_username"
                        placeholderTextColor={Colors.textLight}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        selectionColor={Colors.primary}
                      />
                    </View>
                    <Text style={styles.inputHint}>3-20 characters (letters, numbers, underscores)</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Bio</Text>
                    <View style={[styles.inputWrapper, styles.bioInputWrapper]}>
                      <TextInput
                        style={[styles.textInput, styles.bioTextInput]}
                        value={editBioDraft}
                        onChangeText={setEditBioDraft}
                        placeholder="Tell us about your fitness journey..."
                        placeholderTextColor={Colors.textLight}
                        multiline
                        numberOfLines={4}
                        maxLength={160}
                        selectionColor={Colors.primary}
                      />
                    </View>
                    <Text style={styles.charCount}>{editBioDraft.length}/160</Text>
                  </View>

                  <DuoButton
                    title={savingProfile ? 'Saving...' : 'Save Changes'}
                    onPress={async () => {
                      if (!user) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                      const candidate = (editUsernameDraft || '').trim().toLowerCase();
                      if (candidate && !/^[a-z0-9_]{3,20}$/.test(candidate)) {
                        Alert.alert('Invalid username', 'Use 3-20 characters: letters, numbers, underscores.');
                        return;
                      }
                      try {
                        setSavingProfile(true);
                        const updatePayload: any = { bio: editBioDraft.trim() };

                        const promises: Promise<any>[] = [userApi.updateMyProfile(updatePayload)];
                        if (candidate && candidate !== user.username) {
                          promises.push(socialApi.setMyUsername(candidate));
                        }

                        const results = await Promise.all(promises);
                        const profileRes = results[0];
                        const usernameRes = results.length > 1 ? results[1] : null;

                        await setUser({
                          ...user,
                          username: usernameRes ? usernameRes.username : user.username,
                          bio: profileRes.bio ?? editBioDraft.trim()
                        });

                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                        setEditVisible(false);
                      } catch (e: any) {
                        const status = e?.response?.status;
                        const detail = e?.response?.data?.detail;
                        if (status === 409) {
                          Alert.alert('Username taken', 'That username is already taken. Try another.');
                        } else {
                          Alert.alert('Error', detail || 'Failed to save profile');
                        }
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                    disabled={savingProfile}
                    loading={savingProfile}
                    color={Colors.primary}
                    size="large"
                    style={{ marginTop: Spacing.sm }}
                  />
                </View>
                <View style={{ height: 40 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* XP & Level Section */}
        <AnimatedCard delay={200} type="pop" style={styles.section}>
          <View style={styles.levelCard}>
            <View style={styles.levelHeader}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>Lvl {stats?.level ?? 1}</Text>
              </View>
              <View style={styles.xpInfo}>
                <Text style={styles.xpTitle}>Total XP</Text>
                <Text style={styles.xpSub}>
                  {stats ? `${stats.total_xp} XP • ${stats.xp_for_next_level} XP to next level` : 'Loading...'}
                </Text>
              </View>
            </View>
            <View style={styles.xpProgressTrack}>
              <View
                style={[
                  styles.xpProgressFill,
                  {
                    width: `${stats ? Math.min(100, Math.max(0, ((100 - (stats.xp_for_next_level ?? 100)) / 100) * 100)) : 0}%`,
                  },
                ]}
              />
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
        <SectionTitle
          title="Badges"
          right={(
            <Text style={styles.badgeCount}>
              {badges.filter((b) => b.earned).length}/{badges.length}
            </Text>
          )}
        />

        <AppCard padding={16}>
          <View style={styles.badgesGrid}>
            {badges.slice(0, 4).map((b) => (
              <View key={b.id} style={[styles.badgeCard, !b.earned && styles.badgeCardLocked]}>
                <View style={styles.badgeIconWrap}>
                  <Ionicons name={b.icon as any} size={20} color={b.earned ? Colors.primary : Colors.textLight} />
                </View>
                <View style={styles.badgeTextWrap}>
                  <Text style={styles.badgeTitle}>{b.title}</Text>
                  <Text style={styles.badgeSubtitle} numberOfLines={2}>{b.description}</Text>
                </View>
                {!b.earned && <Ionicons name="lock-closed" size={16} color={Colors.textLight} />}
              </View>
            ))}
          </View>
        </AppCard>
      </AnimatedCard>

      {/* Daily Targets */}
      <AnimatedCard delay={500} type="slide" style={styles.section}>
        <SectionTitle title="Daily Targets" />
        <AppCard padding={8}>
          <ProfileRow
            icon="flame"
            iconColor={Colors.accent}
            label="Calories"
            value={`${Math.round(user?.daily_calorie_target || 0)} kcal`}
            showDivider
          />
          <ProfileRow
            icon="fitness"
            iconColor={Colors.primary}
            label="Protein"
            value={`${Math.round(user?.protein_target || 0)}g`}
            showDivider
          />
          <ProfileRow
            icon="leaf"
            iconColor={Colors.accent}
            label="Carbs"
            value={`${Math.round(user?.carbs_target || 0)}g`}
            showDivider
          />
          <ProfileRow
            icon="water"
            iconColor={Colors.primary}
            label="Fat"
            value={`${Math.round(user?.fat_target || 0)}g`}
          />
        </AppCard>
      </AnimatedCard>

      {/* Preferences */}
      <AnimatedCard delay={600} type="slide" style={styles.section}>
        <SectionTitle title="Preferences" />
        <AppCard padding={8}>
          <ProfileRow
            icon="restaurant"
            iconColor={Colors.textSecondary}
            label="Dietary Preference"
            value={user?.dietary_preference?.replace('_', ' ') || 'None'}
            showDivider
          />
          <ProfileRow
            icon="barbell"
            iconColor={Colors.textSecondary}
            label="Activity Level"
            value={user?.activity_level?.replace('_', ' ') || 'None'}
          />
        </AppCard>
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
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  headerCentered: {
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
  },
  avatarContainerLarge: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: Radius.xxxxl,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.border,
    borderBottomWidth: Spacing.sm + 2,
    overflow: 'hidden',
  },
  avatarTextLarge: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.text,
  },
  editBadgeLarge: {
    position: 'absolute',
    right: -6,
    bottom: Spacing.xs,
    backgroundColor: Colors.primary,
    width: Spacing.xxxl,
    height: Spacing.xxxl,
    borderRadius: Radius.md,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  userNameLarge: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  usernameTextLarge: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primary,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  usernameTextMutedLarge: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    opacity: 0.6,
  },
  socialStatsRowCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxxl,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  statItemCentered: {
    alignItems: 'center',
  },
  statValueCentered: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  statLabelCentered: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statDividerCentered: {
    width: 2,
    height: 32,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  bioSection: {
    width: '100%',
    backgroundColor: Colors.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: Radius.xxl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bioText: {
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 22,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modalCloseBtn: {
    width: Radius.round,
    height: Radius.round,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  modalScroll: {
    flex: 1,
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
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  changePhotoHint: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  inputGroup: {
    marginBottom: Spacing.xxl,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
    paddingHorizontal: Spacing.lg,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primary,
    marginRight: Spacing.xs,
  },
  textInput: {
    flex: 1,
    height: 56,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  inputHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginLeft: Spacing.xs,
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
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: Spacing.xs,
    fontWeight: '700',
  },
  levelCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xxxl,
    padding: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  levelBadge: {
    width: 64,
    height: 64,
    borderRadius: Radius.xxxxl,
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
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  statCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
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
    marginBottom: Spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 8, 8, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xxxxl,
    borderTopRightRadius: Radius.xxxxl,
    paddingBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.border,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  badgeCount: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: Radius.xxxl,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.lg - 2,
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    borderBottomWidth: 6,
  },
  badgeCardLocked: {
    opacity: 0.5,
    backgroundColor: Colors.backgroundSecondary,
  },
  badgeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
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
});