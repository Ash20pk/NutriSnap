import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Modal,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { mealApi, questApi, socialApi, feedApi, ApiLeaderboardEntry, FollowUser, FeedPost } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { format, formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../utils/supabase';
import DuoButton from '../../components/DuoButton';
import StreakCalendarModal from '../../components/StreakCalendarModal';
import AchievementShareModal, { Achievement } from '../../components/AchievementShareModal';
import * as Haptics from 'expo-haptics';

// Deterministic avatar color from name
const AVATAR_COLORS = ['#5B6AF0', '#2F593E', '#F28D35', '#E05C7A', '#3B9FE8', '#8B7A6A', '#C05FF0'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

// ── Post components ──────────────────────────────────────────────

function PostHeader({ name, sub, onPress }: { name: string; sub: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={postStyles.header} activeOpacity={onPress ? 0.75 : 1} onPress={onPress} disabled={!onPress}>
      <View style={[postStyles.avatar, { backgroundColor: avatarColor(name) }]}>
        <Text style={postStyles.avatarText}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={postStyles.name} numberOfLines={1}>{name}</Text>
        <Text style={postStyles.sub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

function PostReactions({ liked: initLiked, count }: { liked?: boolean; count?: number }) {
  const [hyped, setHyped] = useState(initLiked ?? false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const tapHype = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    setHyped(v => !v);
  };

  const hypeCount = (count ?? Math.floor(Math.random() * 12)) + (hyped ? 1 : 0);

  return (
    <View style={postStyles.reactions}>
      <TouchableOpacity style={[postStyles.reactionBtn, hyped && { borderColor: '#FF3D00', backgroundColor: '#FFF5F0' }]} onPress={tapHype} activeOpacity={0.8}>
        <Animated.View style={{ transform: [{ scale: hyped ? scaleAnim : new Animated.Value(1) }] }}>
          <Ionicons name={hyped ? 'flame' : 'flame-outline'} size={18} color={hyped ? '#FF3D00' : '#666'} />
        </Animated.View>
        <Text style={[postStyles.reactionCount, hyped && { color: '#FF3D00' }]}>{hypeCount} Hypes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={postStyles.reactionBtn} activeOpacity={0.8} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}>
        <Ionicons name="chatbubble-outline" size={18} color="#666" />
        <Text style={postStyles.reactionCount}>Comment</Text>
      </TouchableOpacity>
    </View>
  );
}

const postStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  avatar: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.1)' },
  avatarText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  name: { fontSize: 16, fontWeight: '900', color: '#111' },
  sub: { fontSize: 12, fontWeight: '700', color: '#888', marginTop: 2 },
  reactions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 2, borderTopColor: '#f0f0f0' },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f8f8f8', borderWidth: 2, borderColor: '#e8e8e8' },
  reactionCount: { fontSize: 13, fontWeight: '800', color: '#555' },
});

// ── Main screen ──────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { theme, isSpecialUser } = useTheme();
  const styles = makeStyles(theme);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<any>(null);
  const [questStats, setQuestStats] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<ApiLeaderboardEntry[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showStreakCalendar, setShowStreakCalendar] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [hasShownGoalToday, setHasShownGoalToday] = useState(false);
  const [pendingAchievement, setPendingAchievement] = useState<Achievement | null>(null);

  const sparkleAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [mealStats, qStats, lb, fw, feed] = await Promise.all([
        mealApi.getStats(user.id),
        questApi.getStats(user.id),
        questApi.getLeaderboard('global').catch(() => ({ leaderboard: [] })),
        socialApi.getMyFollowing().catch(() => ({ following: [] })),
        feedApi.getFeed(30, 0).catch(() => ({ posts: [] })),
      ]);
      setStats(mealStats);
      setQuestStats(qStats);
      setLeaderboard(lb.leaderboard || []);
      setFollowing(fw.following || []);
      setFeedPosts(feed.posts || []);
    } catch (e) {
      console.error('Home fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handlePhotoPost = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled || !result.assets?.[0]) return;

    setPhotoUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const fileName = `feed/${user!.id}/${Date.now()}.${ext}`;

      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, blob, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(fileName);
      const photoUrl = urlData.publicUrl;

      await feedApi.createPost({
        event_type: 'photo',
        title: `${user!.name.split(' ')[0]} shared a fitness photo`,
        photo_url: photoUrl,
      });

      const feed = await feedApi.getFeed(30, 0);
      setFeedPosts(feed.posts || []);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      console.error('Photo post failed:', e);
    } finally {
      setPhotoUploading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const caloriesEaten = Math.round(stats?.total_calories || 0);
  const caloriesTarget = Math.round(stats?.targets?.calories || 2000);
  const caloriesLeft = Math.max(0, caloriesTarget - caloriesEaten);
  const caloriesPct = Math.min(1, caloriesEaten / caloriesTarget);
  const hasMetGoal = caloriesPct >= 0.8 && caloriesPct <= 1.2;
  const noMealsToday = !stats || (stats.meals_logged === 0 && stats.total_calories === 0);
  const barWidth = screenWidth - 32 - 32;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: caloriesPct,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [caloriesPct, barAnim]);

  useEffect(() => {
    if (hasMetGoal && !hasShownGoalToday && !loading && stats) {
      setShowGoalModal(true);
      setHasShownGoalToday(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const animations = sparkleAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 150),
            Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
          ])
        )
      );
      Animated.parallel(animations).start();
    }
  }, [hasMetGoal, hasShownGoalToday, loading, stats, sparkleAnims]);

  const currentUserRank = leaderboard.find(e => e.is_current_user)?.rank;

  const renderSparkle = (anim: Animated.Value, index: number) => {
    const positions: any[] = [
      { top: -20, left: -20 }, { top: -30, right: -10 },
      { bottom: 40, left: -30 }, { bottom: -10, right: -20 },
      { top: 60, right: -40 }, { top: 20, left: -40 },
    ];
    return (
      <Animated.View key={index} style={[{ position: 'absolute' }, positions[index], {
        opacity: anim,
        transform: [{ scale: anim }, { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }],
      }]}>
        <Ionicons name="sparkles" size={24} color={Colors.warning} />
      </Animated.View>
    );
  };

  // ── Real feed post card ──────────────────────────────────────
  const FeedPostCard = ({ post }: { post: FeedPost }) => {
    const [hyped, setHyped] = useState(post.i_hyped);
    const [hypeCount, setHypeCount] = useState(post.hype_count);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const isMe = post.user_id === user?.id;

    const toggleHype = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.35, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      const next = !hyped;
      setHyped(next);
      setHypeCount(c => c + (next ? 1 : -1));
      try { await feedApi.toggleHype(post.id); } catch { setHyped(!next); setHypeCount(c => c + (next ? -1 : 1)); }
    };

    const timeAgo = (() => {
      try { return formatDistanceToNow(new Date(post.created_at), { addSuffix: true }); }
      catch { return ''; }
    })();

    const badgeGradients: Record<number, [string, string]> = {
      3: ['#F5C518', '#F28D35'],
      2: ['#B0B0B0', '#787878'],
      1: ['#D4874A', '#A0522D'],
    };
    const typeGradients: Record<string, [string, string]> = {
      streak: ['#FF6B35', '#FF3D00'],
      goal:   ['#2F593E', '#4CAF50'],
      xp_level: ['#5B6AF0', '#C05FF0'],
      badge:  badgeGradients[post.metadata?.badge_tier ?? 1] ?? badgeGradients[1],
      photo:  [theme.primary, '#5B6AF0'],
    };
    const gradient = typeGradients[post.event_type] ?? typeGradients.badge;

    return (
      <View style={styles.post}>
        <PostHeader
          name={post.author_name}
          sub={timeAgo}
          onPress={isMe ? undefined : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push(`/public-profile/${post.user_id}` as any); }}
        />

        {/* Photo post */}
        {post.event_type === 'photo' && post.photo_url ? (
          <Image
            source={{ uri: post.photo_url }}
            style={styles.postPhoto}
            contentFit="cover"
          />
        ) : (
          /* Badge / milestone / non-photo */
          <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.postGradientContent}>
            {post.metadata?.badge_icon || post.event_type === 'streak' || post.event_type === 'goal' ? (
              <Text style={styles.postGradientEmoji}>
                {post.metadata?.badge_icon ?? (post.event_type === 'streak' ? '🔥' : post.event_type === 'goal' ? '🎯' : '⚡')}
              </Text>
            ) : null}
            <Text style={styles.postGradientTitle}>{post.title}</Text>
            {post.body ? <Text style={styles.postGradientSub}>{post.body}</Text> : null}
            {post.metadata?.xp ? (
              <View style={styles.postXpPill}>
                <Text style={styles.postXpText}>+{post.metadata.xp} XP</Text>
              </View>
            ) : null}
          </LinearGradient>
        )}

        {/* Caption */}
        {(post.event_type === 'photo' && post.title) && (
          <View style={styles.postCaption}>
            <Text style={styles.postCaptionText}><Text style={{ fontWeight: '900' }}>{post.author_name.split(' ')[0]}</Text> {post.title.replace(`${post.author_name.split(' ')[0]} shared a fitness photo`, 'shared a fitness photo')}</Text>
          </View>
        )}

        {/* Reactions */}
        <View style={styles.postReactions}>
          <TouchableOpacity style={[styles.postReactionBtn, hyped && styles.postReactionBtnActive]} onPress={toggleHype} activeOpacity={0.8}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Ionicons name={hyped ? 'flame' : 'flame-outline'} size={18} color={hyped ? '#FF3D00' : '#666'} />
            </Animated.View>
            <Text style={[styles.postReactionText, hyped && { color: '#FF3D00' }]}>{hypeCount} {hyped ? 'Hyped' : 'Hype'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.postReactionBtn} activeOpacity={0.8} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}>
            <Ionicons name="chatbubble-outline" size={18} color="#666" />
            <Text style={styles.postReactionText}>Comment</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StreakCalendarModal
        visible={showStreakCalendar}
        onClose={() => setShowStreakCalendar(false)}
        userId={user?.id}
      />

      {/* ── Header ─────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 14) }]}>
        <View>
          <Text style={styles.headerGreeting}>
            {isSpecialUser ? '🌸 Hey, you' : `Hey, ${user?.name?.split(' ')[0] ?? 'there'}`}
          </Text>
          <Text style={styles.headerDate}>{format(new Date(), 'EEEE, MMM d')}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowStreakCalendar(true); }}
            activeOpacity={0.85}
          >
            <Ionicons name="flame" size={16} color={Colors.highLevels} />
            <Text style={styles.headerBtnText}>{questStats?.current_streak ?? 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/(tabs)/profile'); }}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={16} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={theme.primary} colors={[theme.primary]} />
        }
      >
        {/* ── Today's Overview Card ───────────────── */}
        <View style={styles.overviewCard}>
          <View style={styles.overviewTopRow}>
            <Text style={styles.overviewLabel}>Today's Progress</Text>
            {currentUserRank && (
              <View style={styles.rankChip}>
                <Ionicons name="podium-outline" size={11} color={Colors.warning} />
                <Text style={styles.rankChipText}>#{currentUserRank} Global</Text>
              </View>
            )}
          </View>

          <View style={styles.calRow}>
            <View>
              <Text style={styles.calEaten}>{caloriesEaten.toLocaleString()}</Text>
              <Text style={styles.calLabel}>of {caloriesTarget.toLocaleString()} kcal</Text>
            </View>
            <View style={[styles.calBubble, hasMetGoal && styles.calBubbleGoal]}>
              <Text style={[styles.calPct, hasMetGoal && { color: Colors.success }]}>
                {Math.round(caloriesPct * 100)}%
              </Text>
              <Text style={styles.calPctSub}>{hasMetGoal ? '🎯 Goal!' : `${caloriesLeft} left`}</Text>
            </View>
          </View>

          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.barFill,
                hasMetGoal && { backgroundColor: Colors.success },
                { width: barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth] }) },
              ]}
            />
          </View>

          <View style={styles.macroPills}>
            {[
              { label: 'P', val: Math.round(stats?.total_protein || 0), target: Math.round(stats?.targets?.protein || 150), color: Colors.protein },
              { label: 'C', val: Math.round(stats?.total_carbs || 0), target: Math.round(stats?.targets?.carbs || 250), color: Colors.carbs },
              { label: 'F', val: Math.round(stats?.total_fat || 0), target: Math.round(stats?.targets?.fat || 65), color: Colors.fat },
            ].map(m => (
              <View key={m.label} style={styles.macroPill}>
                <View style={[styles.macroPillDot, { backgroundColor: m.color }]} />
                <Text style={styles.macroPillVal}>{m.val}g</Text>
                <Text style={styles.macroPillTarget}>/ {m.target}g</Text>
              </View>
            ))}
          </View>

          {noMealsToday && (
            <TouchableOpacity
              style={styles.logCta}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); router.push('/(tabs)/log'); }}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={[theme.primary, theme.primary + 'DD']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.logCtaText}>Log your first meal today</Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Feed ───────────────────────────────── */}
        <View style={styles.feedHeaderRow}>
          <Text style={styles.feedLabel}>Community</Text>
          <TouchableOpacity
            style={styles.photoUploadBtn}
            onPress={handlePhotoPost}
            activeOpacity={0.8}
            disabled={photoUploading}
          >
            <Ionicons name={photoUploading ? 'hourglass-outline' : 'camera-outline'} size={16} color={theme.primary} />
            <Text style={styles.photoUploadText}>{photoUploading ? 'Uploading…' : 'Share Photo'}</Text>
          </TouchableOpacity>
        </View>

        {feedPosts.length === 0 && !loading && (
          <View style={styles.emptyFeed}>
            <Ionicons name="globe-outline" size={36} color={theme.textLight} />
            <Text style={styles.emptyFeedTitle}>Your feed is quiet</Text>
            <Text style={styles.emptyFeedSub}>Follow people from the leaderboard to see their activity here</Text>
            <TouchableOpacity
              style={styles.emptyFeedBtn}
              onPress={() => router.push('/(tabs)/quest' as any)}
            >
              <Text style={styles.emptyFeedBtnText}>Go to Leaderboard</Text>
            </TouchableOpacity>
          </View>
        )}

        {feedPosts.map(post => <FeedPostCard key={post.id} post={post} />)}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Achievement Share Modal ────────────── */}
      <AchievementShareModal
        visible={!!pendingAchievement}
        achievement={pendingAchievement}
        onClose={() => setPendingAchievement(null)}
      />

      {/* ── Goal Crushed Modal ──────────────────── */}
      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={() => setShowGoalModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.goalModal}>
            <View style={styles.goalEmojiWrap}>
              <Text style={{ fontSize: 42 }}>🎯</Text>
              {sparkleAnims.map((anim, i) => renderSparkle(anim, i))}
            </View>
            <Text style={styles.goalTitle}>Daily Goal</Text>
            <Text style={[styles.goalTitle, { color: theme.primary }]}>Crushed!</Text>
            <Text style={styles.goalBody}>You've hit your calorie target for today. Consistency is key!</Text>
            <View style={styles.goalStatsRow}>
              <View style={styles.goalStat}>
                <Text style={styles.goalStatVal}>{caloriesEaten.toLocaleString()}</Text>
                <Text style={styles.goalStatLbl}>KCAL</Text>
              </View>
              <View style={styles.goalDivider} />
              <View style={styles.goalStat}>
                <Text style={styles.goalStatVal}>{stats?.meals_logged || 0}</Text>
                <Text style={styles.goalStatLbl}>MEALS</Text>
              </View>
            </View>
            <DuoButton title="Awesome!" onPress={() => setShowGoalModal(false)} color={theme.primary} size="medium" style={{ width: '100%' }} />
            <TouchableOpacity
              style={styles.shareLink}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowGoalModal(false);
                setPendingAchievement({
                  type: 'goal',
                  title: 'Daily Goal Crushed!',
                  description: `${caloriesEaten.toLocaleString()} kcal across ${stats?.meals_logged || 0} meals today`,
                  icon: '🎯',
                  metadata: { calories: caloriesEaten, meals: stats?.meals_logged || 0 },
                });
              }}
            >
              <Ionicons name="share-social-outline" size={16} color={theme.primary} />
              <Text style={styles.shareLinkText}>SHARE TO FEED</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f2f2f2' },
    flex: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      backgroundColor: theme.white,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerGreeting: { fontSize: 20, fontWeight: '900', color: theme.text },
    headerDate: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: theme.backgroundSecondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
    },
    headerBtnText: { fontSize: 14, fontWeight: '900', color: theme.text },

    // Overview card
    overviewCard: {
      margin: 12,
      backgroundColor: theme.white,
      borderRadius: 24,
      padding: 16,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 6,
      gap: 12,
    },
    overviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    overviewLabel: { fontSize: 12, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: Colors.warning + '18', paddingHorizontal: 9, paddingVertical: 4,
      borderRadius: 20, borderWidth: 1.5, borderColor: Colors.warning + '35',
    },
    rankChipText: { fontSize: 11, fontWeight: '800', color: Colors.warning },
    calRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    calEaten: { fontSize: 36, fontWeight: '900', color: theme.text, letterSpacing: -1 },
    calLabel: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginTop: 2 },
    calBubble: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: theme.primary,
      borderBottomWidth: 5, borderBottomColor: theme.primary + '40',
    },
    calBubbleGoal: { borderColor: Colors.success, borderBottomColor: Colors.success + '40' },
    calPct: { fontSize: 20, fontWeight: '900', color: theme.primary },
    calPctSub: { fontSize: 10, fontWeight: '700', color: theme.textSecondary, marginTop: 2 },
    barTrack: { height: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
    barFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 5 },
    macroPills: { flexDirection: 'row', gap: 8 },
    macroPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: theme.backgroundSecondary,
      paddingHorizontal: 8, paddingVertical: 7,
      borderRadius: 12, borderWidth: 1.5, borderColor: theme.border,
    },
    macroPillDot: { width: 7, height: 7, borderRadius: 4 },
    macroPillVal: { fontSize: 13, fontWeight: '900', color: theme.text },
    macroPillTarget: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
    logCta: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, overflow: 'hidden',
    },
    logCtaText: { flex: 1, fontSize: 14, fontWeight: '900', color: '#fff' },

    // Feed header row
    feedHeaderRow: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16, marginTop: 4, marginBottom: 6,
    },
    feedLabel: {
      fontSize: 12, fontWeight: '900', color: '#888',
      textTransform: 'uppercase', letterSpacing: 1.2,
    },
    photoUploadBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: theme.primary + '15',
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 20, borderWidth: 1.5, borderColor: theme.primary + '30',
    },
    photoUploadText: { fontSize: 12, fontWeight: '800', color: theme.primary },

    // NutriSnap-style feed card
    post: {
      backgroundColor: theme.white,
      marginHorizontal: 12,
      marginBottom: 16,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 6,
      overflow: 'hidden',
    },
    postContentOrganic: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    postIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.border,
    },
    postOrganicTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: theme.text,
      marginBottom: 2,
    },
    postOrganicSub: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      lineHeight: 18,
    },

    // Following grid
    followGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    followGridItem: { alignItems: 'center', gap: 6, width: 60 },
    followGridAvatar: {
      width: 52, height: 52, borderRadius: 26,
      alignItems: 'center', justifyContent: 'center',
    },
    followGridAvatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
    followGridName: { fontSize: 11, fontWeight: '700', color: '#333', textAlign: 'center' },

    // Discover CTA
    discoverCta: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 14, marginBottom: 0,
      borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, overflow: 'hidden',
    },
    discoverCtaText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#fff' },

    // FeedPostCard content
    postPhoto: {
      width: '100%',
      height: 260,
    },
    postGradientContent: {
      marginHorizontal: 12,
      marginBottom: 4,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      gap: 8,
      overflow: 'hidden',
    },
    postGradientEmoji: { fontSize: 44 },
    postGradientTitle: {
      fontSize: 18, fontWeight: '900', color: '#fff',
      textAlign: 'center', lineHeight: 22,
    },
    postGradientSub: {
      fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)',
      textAlign: 'center', lineHeight: 18,
    },
    postXpPill: {
      backgroundColor: 'rgba(255,255,255,0.25)',
      paddingHorizontal: 14, paddingVertical: 5,
      borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    },
    postXpText: { fontSize: 13, fontWeight: '900', color: '#fff' },
    postCaption: { paddingHorizontal: 16, paddingVertical: 10 },
    postCaptionText: { fontSize: 14, fontWeight: '600', color: '#333', lineHeight: 20 },
    postReactions: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 2, borderTopColor: '#f0f0f0',
    },
    postReactionBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 20, backgroundColor: '#f8f8f8',
      borderWidth: 2, borderColor: '#e8e8e8',
    },
    postReactionBtnActive: {
      borderColor: '#FF3D00', backgroundColor: '#FFF5F0',
    },
    postReactionText: { fontSize: 13, fontWeight: '800', color: '#555' },

    // Empty feed
    emptyFeed: {
      backgroundColor: theme.white, margin: 12,
      borderRadius: 24, padding: 32,
      alignItems: 'center', gap: 10,
      borderWidth: 2, borderColor: theme.border,
      borderBottomWidth: 6,
    },
    emptyFeedTitle: { fontSize: 16, fontWeight: '900', color: theme.text },
    emptyFeedSub: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
    emptyFeedBtn: {
      backgroundColor: theme.primary, paddingHorizontal: 20,
      paddingVertical: 10, borderRadius: 14, marginTop: 4,
    },
    emptyFeedBtnText: { fontSize: 13, fontWeight: '900', color: '#fff' },

    // Goal modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    goalModal: {
      backgroundColor: theme.white, borderRadius: 32, padding: 28,
      width: '100%', alignItems: 'center',
      borderWidth: 3, borderColor: theme.border, borderBottomWidth: 10,
    },
    goalEmojiWrap: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: theme.backgroundSecondary,
      justifyContent: 'center', alignItems: 'center',
      marginBottom: 16, borderWidth: 3, borderColor: theme.border, position: 'relative',
    },
    goalTitle: { fontSize: 24, fontWeight: '900', color: theme.text, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 28 },
    goalBody: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, fontWeight: '600', marginTop: 6, marginBottom: 16 },
    goalStatsRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: theme.backgroundSecondary,
      borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
      marginBottom: 20, borderWidth: 2, borderColor: theme.border, alignSelf: 'stretch',
    },
    goalStat: { flex: 1, alignItems: 'center' },
    goalStatVal: { fontSize: 20, fontWeight: '900', color: theme.text },
    goalStatLbl: { fontSize: 10, fontWeight: '800', color: theme.textSecondary, marginTop: 2 },
    goalDivider: { width: 1.5, height: 28, backgroundColor: theme.border },
    shareLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, padding: 8 },
    shareLinkText: { fontSize: 12, fontWeight: '900', color: theme.primary, letterSpacing: 1 },
  });
}
