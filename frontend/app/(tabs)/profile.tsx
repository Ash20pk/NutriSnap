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
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Radius } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import PageHeader from '../../components/PageHeader';
import AnimatedCard from '../../components/AnimatedCard';
import SectionTitle from '../../components/SectionTitle';
import AppCard from '../../components/AppCard';
import DuoButton from '../../components/DuoButton';
import ProfileRow from '../../components/ProfileRow';
import { useRouter } from 'expo-router';
import { questApi, socialApi, userApi, WeightHistoryEntry } from '../../utils/api';
import { supabase } from '../../utils/supabase';
import { LineChart } from 'react-native-gifted-charts';

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
  const [weightHistory, setWeightHistory] = React.useState<WeightHistoryEntry[]>([]);

  const [editVisible, setEditVisible] = React.useState(false);
  const [editUsernameDraft, setEditUsernameDraft] = React.useState('');
  const [editNameDraft, setEditNameDraft] = React.useState('');
  const [editBioDraft, setEditBioDraft] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [profileRefreshLoading, setProfileRefreshLoading] = React.useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const candidate = (editUsernameDraft || '').trim().toLowerCase();
    if (candidate && !/^[a-z0-9_]{3,20}$/.test(candidate)) {
      Alert.alert('Invalid username', 'Use 3-20 characters: letters, numbers, underscores.');
      return;
    }
    try {
      setSavingProfile(true);
      const updatePayload: any = {
        bio: editBioDraft.trim(),
        name: editNameDraft.trim()
      };

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
        name: editNameDraft.trim(),
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
  };

  React.useEffect(() => {
    setEditUsernameDraft((user?.username || '').toString());
    setEditNameDraft((user?.name || '').toString());
    setEditBioDraft((user?.bio || '').toString());
  }, [user?.username, user?.name, user?.bio]);

  const refreshProfileData = React.useCallback(async () => {
    if (!user?.id) return;
    setProfileRefreshLoading(true);
    try {
      const [statsRes, badgesRes, followersRes, followingRes, weightRes] = await Promise.all([
        questApi.getStats(user.id),
        questApi.getBadges(user.id),
        socialApi.getMyFollowers(),
        socialApi.getMyFollowing(),
        userApi.getWeightHistory(12).catch(() => []),
      ]);
      setStats(statsRes);
      setBadges(badgesRes.badges || []);
      setFollowersCount((followersRes.followers || []).length);
      setFollowingCount((followingRes.following || []).length);
      setWeightHistory(Array.isArray(weightRes) ? weightRes : []);
    } catch (e) {
      console.error('Error loading profile data:', e);
    } finally {
      setProfileRefreshLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    refreshProfileData();
  }, [refreshProfileData]);

  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);

  const handlePickPhoto = async () => {
    if (!user) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Allow Loggr to access your photos to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;

      setUploadingPhoto(true);
      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const filePath = `${user.id}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, bytes, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const updated = await userApi.updateMyProfile({ avatar_url: urlData.publicUrl });
      await setUser({ ...user, avatar_url: updated.avatar_url ?? urlData.publicUrl });
      setAvatarImageFailed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not update profile photo. Try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

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
                      logout();
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
        rightComponent={
          <TouchableOpacity 
            onPress={refreshProfileData} 
            disabled={profileRefreshLoading}
            style={styles.refreshBtn}
          >
            <Ionicons 
              name="refresh" 
              size={22} 
              color={theme.primary} 
              style={profileRefreshLoading ? { opacity: 0.5 } : null}
            />
          </TouchableOpacity>
        }
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
                {user?.is_special_user ? (
                  <LinearGradient
                    colors={['#FF6B8A', '#FF2D55', '#FF6B8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarHeartFrame}
                  >
                    <View style={styles.avatarLargeSpecial}>
                      {!avatarImageFailed && resolvedAvatarUrl ? (
                        <Image
                          source={{ uri: resolvedAvatarUrl }}
                          style={{ width: '100%', height: '100%', borderRadius: 30 }}
                          onError={() => setAvatarImageFailed(true)}
                        />
                      ) : (
                        <Text style={styles.avatarTextLarge}>
                          {user?.name?.[0]?.toUpperCase() || 'U'}
                        </Text>
                      )}
                    </View>
                  </LinearGradient>
                ) : (
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
                )}
                {user?.is_special_user && (
                  <View style={styles.heartBadge}>
                    <Ionicons name="heart" size={12} color="#fff" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.editBadgeLarge}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setEditVisible(true);
                  }}
                >
                  <Ionicons name="pencil" size={16} color={theme.white} />
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
                color={theme.primary}
                size="large"
                style={{ width: '100%', marginTop: 8 }}
                leftIcon={<Ionicons name="create-outline" size={18} color={theme.white} />}
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
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity
                  onPress={async () => {
                    // Trigger the same save logic as the DuoButton
                    // We can move the logic to a helper function
                    handleSaveProfile();
                  }}
                  disabled={savingProfile}
                >
                  <Text style={[styles.saveBtnText, savingProfile && { opacity: 0.5 }]}>
                    {savingProfile ? '...' : 'Done'}
                  </Text>
                </TouchableOpacity>
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
                        onPress={handlePickPhoto}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto
                          ? <ActivityIndicator size="small" color={theme.white} />
                          : <Ionicons name="camera" size={18} color={theme.white} />}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.changePhotoHint}>Tap to change photo</Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Name</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={20} color={theme.primary} style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.textInput}
                        value={editNameDraft}
                        onChangeText={setEditNameDraft}
                        placeholder="Your name"
                        placeholderTextColor={theme.textLight}
                        selectionColor={theme.primary}
                      />
                    </View>
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
                        placeholderTextColor={theme.textLight}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        selectionColor={theme.primary}
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
                        placeholderTextColor={theme.textLight}
                        multiline
                        numberOfLines={4}
                        maxLength={160}
                        selectionColor={theme.primary}
                      />
                    </View>
                    <Text style={styles.charCount}>{editBioDraft.length}/160</Text>
                  </View>

                  <DuoButton
                    title={savingProfile ? 'Saving...' : 'Save Changes'}
                    onPress={handleSaveProfile}
                    disabled={savingProfile}
                    loading={savingProfile}
                    color={theme.primary}
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

        {weightHistory.length >= 2 && (
          <AnimatedCard delay={350} type="slide" style={styles.section}>
            <SectionTitle title="Weight Progress" />
            <AppCard padding={16}>
              <LineChart
                data={weightHistory
                  .slice()
                  .reverse()
                  .map((e) => ({ value: e.weight }))}
                height={120}
                width={280}
                color={theme.primary}
                thickness={2}
                hideDataPoints={weightHistory.length > 8}
                dataPointsColor={theme.primary}
                startFillColor={theme.primary}
                endFillColor={theme.background}
                startOpacity={0.25}
                endOpacity={0.02}
                initialSpacing={8}
                noOfSections={4}
                yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                rulesColor={theme.border}
                areaChart
              />
              <Text style={styles.weightChartSub}>
                Last {weightHistory.length} entries · current {user?.weight ?? '—'} kg
              </Text>
            </AppCard>
          </AnimatedCard>
        )}

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
            iconColor={theme.primary}
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
            iconColor={theme.primary}
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
            iconColor={theme.textSecondary}
            label="Dietary Preference"
            value={user?.dietary_preference?.replace('_', ' ') || 'None'}
            showDivider
          />
          <ProfileRow
            icon="barbell"
            iconColor={theme.textSecondary}
            label="Activity Level"
            value={user?.activity_level?.replace('_', ' ') || 'None'}
          />
        </AppCard>
      </AnimatedCard>

      {/* Redeem Code */}
      <AnimatedCard delay={680} type="pop" style={styles.section}>
        <AppCard padding={16}>
          <TouchableOpacity
            style={styles.redeemRow}
            onPress={() => router.push('/redeem' as any)}
          >
            <Ionicons name="gift-outline" size={20} color={theme.primary} />
            <Text style={styles.redeemText}>
              {user?.is_special_user ? '🌸 Special Access Active' : 'Redeem a Code'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
          </TouchableOpacity>
        </AppCard>
      </AnimatedCard>

      {/* Logout Button */}
      <AnimatedCard delay={700} type="pop" style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </AnimatedCard>

      {/* Danger Zone */}
      <AnimatedCard delay={750} type="pop" style={styles.section}>
        <SectionTitle title="Danger Zone" />
        <AppCard padding={16}>
          <TouchableOpacity
            onPress={() => router.push('/privacy-policy' as any)}
            style={styles.dangerRow}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.textSecondary} />
            <Text style={styles.dangerRowText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
          </TouchableOpacity>
          <View style={styles.dangerDivider} />
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Ionicons name="trash" size={20} color={Colors.error} />
            <Text style={styles.deleteText}>Delete Account</Text>
          </TouchableOpacity>
        </AppCard>
      </AnimatedCard>

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
    paddingHorizontal: Spacing.xxl,
    paddingBottom: 100,
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
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.border,
    borderBottomWidth: Spacing.sm + 2,
    overflow: 'hidden',
  },
  avatarHeartFrame: {
    width: 110,
    height: 110,
    borderRadius: 36,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeSpecial: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heartBadge: {
    position: 'absolute',
    left: -6,
    bottom: Spacing.xs,
    backgroundColor: '#FF2D55',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarTextLarge: {
    fontSize: 40,
    fontWeight: '900',
    color: theme.text,
  },
  editBadgeLarge: {
    position: 'absolute',
    right: -6,
    bottom: Spacing.xs,
    backgroundColor: theme.primary,
    width: Spacing.xxxl,
    height: Spacing.xxxl,
    borderRadius: Radius.md,
    borderWidth: 3,
    borderColor: theme.white,
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
    color: theme.text,
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  usernameTextLarge: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.primary,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  usernameTextMutedLarge: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textSecondary,
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
    color: theme.text,
  },
  statLabelCentered: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  statDividerCentered: {
    width: 2,
    height: 32,
    backgroundColor: theme.border,
    opacity: 0.5,
  },
  bioSection: {
    width: '100%',
    backgroundColor: theme.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: Radius.xxl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  bioText: {
    fontSize: 15,
    color: theme.text,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 22,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
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
    shadowColor: '#000',
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
  levelCard: {
    backgroundColor: theme.white,
    borderRadius: Radius.xxxl,
    padding: Spacing.xl,
    borderWidth: 2,
    borderColor: theme.border,
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
    color: theme.white,
    textTransform: 'uppercase',
  },
  xpInfo: {
    flex: 1,
  },
  xpTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: theme.text,
    textTransform: 'uppercase',
  },
  xpSub: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.textSecondary,
    marginTop: 2,
  },
  xpProgressTrack: {
    height: 16,
    backgroundColor: theme.border,
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
  section: {
    marginBottom: Spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 8, 8, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.background,
    borderTopLeftRadius: Radius.xxxxl,
    borderTopRightRadius: Radius.xxxxl,
    paddingBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: theme.border,
    height: '85%',
    width: '100%',
    elevation: 20,
    shadowColor: '#000',
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
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xl,
    paddingBottom: 60,
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
    backgroundColor: theme.white,
    borderRadius: Radius.xxxl,
    borderWidth: 2,
    borderColor: theme.border,
    padding: Spacing.lg - 2,
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    borderBottomWidth: 6,
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
  });
}