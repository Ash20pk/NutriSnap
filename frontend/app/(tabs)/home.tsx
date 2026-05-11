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
import { Colors } from '../../constants/Colors';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { mealApi, questApi, postApi, ApiLeaderboardEntry, Post } from '../../utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import DuoButton from '../../components/DuoButton';
import PageHeader from '../../components/PageHeader';
import StreakCalendarModal from '../../components/StreakCalendarModal';
import AchievementShareModal, { Achievement } from '../../components/AchievementShareModal';
import PostCard from '../../components/PostCard';
import CommentsSheet from '../../components/CommentsSheet';
import CreatePostSheet from '../../components/CreatePostSheet';
import * as Haptics from 'expo-haptics';

// ── Main screen ──────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { theme, isSpecialUser } = useTheme();
  const styles = makeStyles(theme);
  const { width: screenWidth } = useWindowDimensions();

  const [stats, setStats] = useState<any>(null);
  const [questStats, setQuestStats] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<ApiLeaderboardEntry[]>([]);
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
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
      const [mealStats, qStats, lb, feed] = await Promise.all([
        mealApi.getStats(user.id),
        questApi.getStats(user.id),
        questApi.getLeaderboard('global').catch(() => ({ leaderboard: [] })),
        postApi.getFeed(20).catch(() => ({ posts: [], next_cursor: null })),
      ]);
      setStats(mealStats);
      setQuestStats(qStats);
      setLeaderboard(lb.leaderboard || []);
      setFeedPosts(feed.posts || []);
      setNextCursor(feed.next_cursor ?? null);
    } catch (e) {
      console.error('Home fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMorePosts = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const feed = await postApi.getFeed(20, nextCursor);
      setFeedPosts(prev => [...prev, ...(feed.posts || [])]);
      setNextCursor(feed.next_cursor ?? null);
    } catch (e) {
      console.error('Load more error:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

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

  const renderFeedSkeleton = () => (
    <View style={{ gap: 16 }}>
      {[1, 2, 3].map(i => (
        <View key={i} style={[styles.post, { height: 320, opacity: 0.6, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="image-outline" size={48} color="#ccc" />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <StreakCalendarModal
        visible={showStreakCalendar}
        onClose={() => setShowStreakCalendar(false)}
        userId={user?.id}
      />
      <CreatePostSheet
        visible={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onPosted={fetchAll}
      />
      <CommentsSheet
        visible={!!commentPost}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={postId => {
          setFeedPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
          ));
        }}
      />

      <PageHeader
        title={`Hey, ${user?.name?.split(' ')[0] ?? 'there'} 🌸`}
        subtitle={isSpecialUser ? 'Made with love for you ❤️' : undefined}
        rightComponent={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setShowStreakCalendar(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="flame" size={18} color={Colors.highLevels} />
              <Text style={styles.headerBtnText}>{questStats?.current_streak ?? 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.push('/(tabs)/profile'); }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>
        }
      />

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
          {/* Progress Fill Background */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: hasMetGoal ? Colors.success + '15' : theme.primary + '10',
                width: `${Math.min(100, caloriesPct * 100)}%`,
              }
            ]}
          />

          <View style={styles.overviewTopRow}>
            <Text style={styles.overviewLabel}>Today&apos;s Energy</Text>
            {currentUserRank && (
              <View style={styles.rankChip}>
                <Ionicons name="podium-outline" size={11} color={Colors.warning} />
                <Text style={styles.rankChipText}>#{currentUserRank} Global</Text>
              </View>
            )}
          </View>

          <View style={styles.energyMain}>
            <View style={styles.energyStatItemLeft}>
              <Text style={styles.energyStatValueLarge}>{caloriesEaten.toLocaleString()}</Text>
              <Text style={styles.energyStatLabel}>Eaten</Text>
            </View>
            <View style={styles.energyStatItemRight}>
              <Text style={styles.energyStatValueLarge}>{caloriesTarget.toLocaleString()}</Text>
              <Text style={styles.energyStatLabel}>Target</Text>
            </View>
          </View>

          <View style={styles.macroStrip}>
            {[
              { label: 'Pro', val: Math.round(stats?.total_protein || 0), color: Colors.protein },
              { label: 'Carb', val: Math.round(stats?.total_carbs || 0), color: Colors.carbs },
              { label: 'Fat', val: Math.round(stats?.total_fat || 0), color: Colors.fat },
            ].map(m => (
              <View key={m.label} style={styles.macroStripItem}>
                <Text style={[styles.macroStripValue, { color: m.color }]}>{m.val}g</Text>
                <Text style={styles.macroStripLabel}>{m.label}</Text>
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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setShowCreatePost(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="camera-outline" size={16} color={theme.primary} />
            <Text style={styles.photoUploadText}>Share Photo</Text>
          </TouchableOpacity>
        </View>

        {loading && feedPosts.length === 0 ? (
          renderFeedSkeleton()
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {feedPosts.length === 0 && (
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

            {feedPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                onCommentPress={setCommentPost}
                onDeleted={id => setFeedPosts(prev => prev.filter(p => p.id !== id))}
              />
            ))}
          </View>
        )}

        {nextCursor && !loadingMore && (
          <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMorePosts} activeOpacity={0.8}>
            <Text style={styles.loadMoreText}>Load more</Text>
          </TouchableOpacity>
        )}
        {loadingMore && <Ionicons name="ellipsis-horizontal" size={20} color="#ccc" style={{ alignSelf: 'center', marginBottom: 8 }} />}

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
            <Text style={styles.goalBody}>You&apos;ve hit your calorie target for today. Consistency is key!</Text>
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
    container: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // Header
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: theme.white,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
    },
    headerIconBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: theme.white,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 4,
    },
    headerBtnText: { fontSize: 15, fontWeight: '800', color: theme.text },

    // Overview card
    overviewCard: {
      margin: 12,
      backgroundColor: theme.white,
      borderRadius: 24,
      padding: 20,
      borderWidth: 2,
      borderColor: theme.border,
      borderBottomWidth: 6,
      overflow: 'hidden',
    },
    overviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    overviewLabel: { fontSize: 12, fontWeight: '800', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
    rankChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: Colors.warning + '18', paddingHorizontal: 9, paddingVertical: 4,
      borderRadius: 20, borderWidth: 1.5, borderColor: Colors.warning + '35',
    },
    rankChipText: { fontSize: 11, fontWeight: '800', color: Colors.warning },
    energyMain: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingBottom: 16,
    },
    energyStatItemLeft: {
      alignItems: 'flex-start',
    },
    energyStatItemRight: {
      alignItems: 'flex-end',
    },
    energyStatValueLarge: {
      fontSize: 36,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -1,
    },
    energyStatLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textSecondary,
      marginTop: -2,
    },
    macroStrip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 16,
      marginBottom: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border + '40',
    },
    macroStripItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    macroStripValue: {
      fontSize: 14,
      fontWeight: '900',
    },
    macroStripLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: theme.textSecondary,
      textTransform: 'uppercase',
    },
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

    // Load more
    loadMoreBtn: {
      alignSelf: 'center', marginBottom: 12,
      paddingHorizontal: 20, paddingVertical: 10,
      borderRadius: 20, backgroundColor: '#f0f0f0',
      borderWidth: 1.5, borderColor: '#e0e0e0',
    },
    loadMoreText: { fontSize: 13, fontWeight: '800', color: '#666' },

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
