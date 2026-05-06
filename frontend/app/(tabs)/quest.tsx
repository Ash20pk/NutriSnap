import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, TextInput } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../context/ThemeContext';
import { fontStyles } from '../../constants/Fonts';
import PageHeader from '../../components/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import AnimatedCard from '../../components/AnimatedCard';
import SectionTitle from '../../components/SectionTitle';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import PillTabs from '../../components/PillTabs';
import UserRow from '../../components/UserRow';
import * as Haptics from 'expo-haptics';
import { useUser } from '../../context/UserContext';
import { questApi, socialApi } from '../../utils/api';

interface Quest {
  id: string;
  title: string;
  description?: string;
  icon: string;
  icon_color?: string;
  xp?: number;
  xp_reward?: number;
  current?: number;
  progress?: number;
  target: number;
  unit?: string;
  is_completed: boolean;
  xp_claimed?: boolean;
  is_claimed?: boolean;
}

interface Badge {
  id: string;
  type?: string;
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

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  total_xp: number;
  level?: number;
  badges_earned?: number;
  is_current_user?: boolean;
}

interface UserSearchResult {
  id: string;
  name: string;
  username?: string;
  avatar_url?: string;
  is_following?: boolean;
}

export default function QuestScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { user, showXpPopup } = useUser();
  const [activeTab, setActiveTab] = useState<'quests' | 'leaderboard' | 'badges'>('quests');
  const [leaderboardScope, setLeaderboardScope] = useState<'global' | 'friends'>('global');

  const [quests, setQuests] = useState<Quest[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [followLoadingId, setFollowLoadingId] = useState<string | null>(null);
  const [stats, setStats] = useState<QuestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const refreshLeaderboard = useCallback(async () => {
    try {
      const leaderboardRes = await questApi.getLeaderboard(leaderboardScope);
      setLeaderboard(leaderboardRes.leaderboard || []);
    } catch (e) {
      console.error('Error fetching leaderboard:', e);
    }
  }, [leaderboardScope]);

  const fetchQuestData = useCallback(async () => {
    if (!user?.id) return;

    try {
      const [questsRes, badgesRes, statsRes, leaderboardRes] = await Promise.all([
        questApi.getDailyQuests(user.id),
        questApi.getBadges(user.id),
        questApi.getStats(user.id),
        questApi.getLeaderboard(leaderboardScope),
      ]);

      setQuests(questsRes.quests || []);
      setBadges(badgesRes.badges || []);
      setStats(statsRes);
      setLeaderboard(leaderboardRes.leaderboard || []);

      // Check for new badges
      const badgeCheck = await questApi.checkBadges(user.id);
      if (badgeCheck.newly_earned?.length > 0) {
        Alert.alert(
          '🏆 Badge Earned!',
          `You earned: ${badgeCheck.newly_earned.map((b: any) => b.title).join(', ')}\n+${badgeCheck.xp_earned} XP`,
          [{ text: 'Awesome!' }]
        );
        // Refresh badges and stats
        const [newBadges, newStats] = await Promise.all([
          questApi.getBadges(user.id),
          questApi.getStats(user.id),
        ]);
        setBadges(newBadges.badges || []);
        setStats(newStats);
      }
    } catch (error) {
      console.error('Error fetching quest data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, leaderboardScope]);

  useEffect(() => {
    if (!user?.id) return;
    refreshLeaderboard();
  }, [leaderboardScope, user?.id, refreshLeaderboard]);

  useEffect(() => {
    if (!user?.id) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      socialApi
        .searchUsers(q)
        .then((res) => {
          if (cancelled) return;
          setSearchResults(res.results || []);
        })
        .catch((e) => {
          if (cancelled) return;
          console.error('Error searching users:', e);
          setSearchResults([]);
        })
        .finally(() => {
          if (cancelled) return;
          setSearching(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, user?.id]);

  useEffect(() => {
    fetchQuestData();
  }, [fetchQuestData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQuestData();
  }, [fetchQuestData]);

  const handleClaimXp = async (questId: string) => {
    if (!user?.id || claimingId) return;

    setClaimingId(questId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => { });

    try {
      const result = await questApi.claimQuestXp(user.id, questId);

      // Update local state
      setQuests(prev => prev.map(q =>
        q.id === questId ? { ...q, xp_claimed: true } : q
      ));
      setStats(prev => prev ? {
        ...prev,
        total_xp: result.total_xp,
        level: result.level,
        quests_completed: result.quests_completed,
      } : null);

      // Refresh leaderboard after claiming XP to reflect new score
      await refreshLeaderboard();

      // Show XP popup
      showXpPopup(result.xp_earned);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to claim XP');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <PageHeader
        title="Quest"
        subtitle="Complete quests and climb the leaderboard."
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <PillTabs
          style={styles.tabContainer}
          tabs={[
            { key: 'quests', label: 'Quests' },
            { key: 'leaderboard', label: 'Ranks' },
            { key: 'badges', label: 'Badges' },
          ]}
          activeKey={activeTab}
          onChange={setActiveTab}
        />

        {/* Stats Header */}
        {stats && (
          <AnimatedCard delay={50} type="pop" style={styles.section}>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>{stats.level}</Text>
                </View>
                <Text style={styles.statLabel}>LEVEL</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.total_xp}</Text>
                <Text style={styles.statLabel}>TOTAL XP</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <View style={styles.streakBadgeSmall}>
                  <Ionicons name="flame" size={16} color={Colors.warning} />
                  <Text style={styles.streakValue}>{stats.current_streak}</Text>
                </View>
                <Text style={styles.statLabel}>STREAK</Text>
              </View>
            </View>
          </AnimatedCard>
        )}

        {activeTab === 'quests' ? (
          <>
            <AnimatedCard delay={100} type="pop" style={styles.section}>
              <SectionTitle title="Today's Quests" />
              <View style={styles.card}>
                {loading ? (
                  <LoadingState style={styles.loadingContainer} textStyle={styles.loadingText} label="Loading quests..." />
                ) : quests.length === 0 ? (
                  <EmptyState
                    style={styles.emptyFriends}
                    icon="trophy-outline"
                    title="No quests yet"
                    subtitle="Start logging meals to unlock daily quests!"
                    titleStyle={styles.emptyFriendsTitle}
                    subtitleStyle={styles.emptyFriendsText}
                  />
                ) : (
                  quests.map((quest, index) => (
                    <View key={quest.id}>
                      <View style={styles.questTopRow}>
                        <View style={[styles.cardIcon, { backgroundColor: quest.icon_color + '15' }]}>
                          <Ionicons name={quest.icon as any} size={24} color={quest.icon_color} />
                        </View>
                        <View style={styles.questMain}>
                          <View style={styles.questTitleRow}>
                            <Text style={styles.cardTitle}>{quest.title}</Text>
                            {quest.is_completed && !quest.xp_claimed ? (
                              <TouchableOpacity
                                style={styles.claimButton}
                                onPress={() => handleClaimXp(quest.id)}
                                disabled={claimingId === quest.id}
                              >
                                {claimingId === quest.id ? (
                                  <ActivityIndicator size="small" color={theme.white} />
                                ) : (
                                  <Text style={styles.claimButtonText}>CLAIM +{quest.xp} XP</Text>
                                )}
                              </TouchableOpacity>
                            ) : quest.xp_claimed ? (
                              <View style={styles.claimedPill}>
                                <Ionicons name="checkmark" size={14} color={Colors.success} />
                                <Text style={styles.claimedText}>CLAIMED</Text>
                              </View>
                            ) : (
                              <View style={styles.xpPill}>
                                <Text style={styles.xpText}>+{quest.xp} XP</Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.questMetaRow}>
                            <Text style={styles.questMeta}>
                              {quest.unit === '%' ? `${Math.round(quest.current ?? 0)}%` : `${quest.current ?? 0} ${quest.unit || ''}`} / {quest.unit === '%' ? '100%' : `${quest.target} ${quest.unit || ''}`}
                            </Text>
                            <Text style={styles.questPercent}>
                              {Math.round(((quest.current ?? 0) / quest.target) * 100)}%
                            </Text>
                          </View>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                {
                                  width: `${Math.min(100, ((quest.current ?? 0) / quest.target) * 100)}%`,
                                  backgroundColor: quest.is_completed ? Colors.success : quest.icon_color
                                }
                              ]}
                            />
                          </View>
                        </View>
                      </View>
                      {index !== quests.length - 1 && <View style={styles.divider} />}
                    </View>
                  ))
                )}
              </View>
            </AnimatedCard>
          </>
        ) : activeTab === 'leaderboard' ? (
          <>
            <AnimatedCard delay={80} type="pop" style={styles.section}>
              <PillTabs
                style={styles.leaderboardScopeWrap}
                tabs={[
                  { key: 'global', label: 'Global' },
                  { key: 'friends', label: 'Friends' },
                ]}
                activeKey={leaderboardScope}
                onChange={setLeaderboardScope}
              />
            </AnimatedCard>

            <AnimatedCard delay={100} type="pop" style={styles.section}>
              <SectionTitle title="Find Friends" />
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={theme.textLight} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search username..."
                  placeholderTextColor={theme.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color={theme.textLight} />
                  </TouchableOpacity>
                )}
              </View>

              {searchQuery.trim().length >= 2 && (
                <View style={[styles.card, { marginTop: 12 }]}> 
                  {searching ? (
                    <LoadingState style={styles.loadingContainer} textStyle={styles.loadingText} size="small" label="Searching..." />
                  ) : searchResults.length === 0 ? (
                    <EmptyState
                      style={styles.emptyFriends}
                      icon="search"
                      title="No results"
                      subtitle="Try a different username."
                      titleStyle={styles.emptyFriendsTitle}
                      subtitleStyle={styles.emptyFriendsText}
                    />
                  ) : (
                    <View style={styles.resultsList}>
                      {searchResults.map((result, idx) => (
                        <View key={result.id}>
                          <UserRow
                            style={styles.searchResultCard}
                            title={result.name}
                            subtitle={`@${result.username}`}
                            titleStyle={styles.resultName}
                            subtitleStyle={styles.resultBio}
                            avatar={{
                              text: (result.name || result.username || 'U')[0].toUpperCase(),
                              containerStyle: styles.avatar,
                              textStyle: styles.avatarText,
                            }}
                            right={(
                              <TouchableOpacity
                                style={[styles.miniFollowBtn, result.is_following && styles.miniFollowBtnActive]}
                                disabled={followLoadingId === result.id || result.id === user?.id}
                                onPress={async () => {
                                  if (!user?.id) return;
                                  if (result.id === user.id) return;
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

                                  try {
                                    setFollowLoadingId(result.id);
                                    if (result.is_following) {
                                      await socialApi.unfollowUser(result.id);
                                    } else {
                                      await socialApi.followUser(result.id);
                                    }
                                    const newRes = await socialApi.searchUsers(searchQuery.trim());
                                    setSearchResults(newRes.results || []);
                                    if (leaderboardScope === 'friends') {
                                      await refreshLeaderboard();
                                    }
                                  } catch {
                                    Alert.alert('Error', 'Failed to update follow status');
                                  } finally {
                                    setFollowLoadingId(null);
                                  }
                                }}
                              >
                                {followLoadingId === result.id ? (
                                  <ActivityIndicator size="small" color={result.is_following ? theme.white : theme.primary} />
                                ) : (
                                  <Ionicons
                                    name={result.is_following ? 'checkmark' : 'add'}
                                    size={18}
                                    color={result.is_following ? theme.white : theme.primary}
                                  />
                                )}
                              </TouchableOpacity>
                            )}
                          />
                          {idx !== searchResults.length - 1 && <View style={styles.rowDivider} />}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </AnimatedCard>

            <AnimatedCard delay={120} type="pop" style={styles.section}>
              <SectionTitle title={leaderboardScope === 'global' ? 'Global Top 50' : 'Friends Ranking'} />
            {loading ? (
              <View style={styles.card}>
                <LoadingState style={styles.loadingContainer} textStyle={styles.loadingText} label="Loading rankings..." />
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={styles.card}>
                <EmptyState
                  style={styles.emptyFriends}
                  icon="podium-outline"
                  title="No rankings yet"
                  subtitle={
                    leaderboardScope === 'friends'
                      ? 'Follow friends to see their rankings here.'
                      : 'Be the first to claim a spot on the leaderboard!'
                  }
                  titleStyle={styles.emptyFriendsTitle}
                  subtitleStyle={styles.emptyFriendsText}
                />
              </View>
            ) : (
              <View style={styles.card}>
                {leaderboard.map((entry, index) => (
                  <View key={entry.user_id}>
                    <UserRow
                      style={styles.leaderRow}
                      title={`${entry.name}${entry.is_current_user ? ' (You)' : ''}`}
                      subtitle={`Level ${entry.level} • ${entry.badges_earned} Badges`}
                      titleStyle={styles.leaderName}
                      subtitleStyle={styles.leaderMeta}
                      avatar={{
                        text: entry.name.charAt(0),
                        containerStyle: styles.avatarSmall,
                        textStyle: styles.avatarTextSmall,
                      }}
                      left={(
                        <View
                          style={[
                            styles.rankPill,
                            index === 0 ? { backgroundColor: '#FFD70020', borderColor: '#FFD700' } :
                              index === 1 ? { backgroundColor: '#C0C0C020', borderColor: '#C0C0C0' } :
                                index === 2 ? { backgroundColor: '#CD7F3220', borderColor: '#CD7F32' } : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.rankText,
                              index === 0 ? { color: '#B8860B' } :
                                index === 1 ? { color: '#7F7F7F' } :
                                  index === 2 ? { color: '#A0522D' } :
                                    null,
                            ]}
                          >
                            #{entry.rank}
                          </Text>
                        </View>
                      )}
                      right={(
                        <View style={styles.activityXp}>
                          <Text style={styles.activityXpText}>{entry.total_xp} XP</Text>
                        </View>
                      )}
                    />
                    {index !== leaderboard.length - 1 && <View style={styles.rowDivider} />}
                  </View>
                ))}
              </View>
            )}
            </AnimatedCard>
          </>
        ) : (
          <>
            <AnimatedCard delay={100} type="pop" style={styles.section}>
              <SectionTitle title="Your Badges" />
              {loading ? (
                <View style={styles.card}>
                  <LoadingState style={styles.loadingContainer} textStyle={styles.loadingText} label="Loading badges..." />
                </View>
              ) : badges.length === 0 ? (
                <View style={styles.card}>
                  <EmptyState
                    style={styles.emptyFriends}
                    icon="ribbon-outline"
                    title="No badges yet"
                    subtitle="Complete quests and hit milestones to earn badges!"
                    titleStyle={styles.emptyFriendsTitle}
                    subtitleStyle={styles.emptyFriendsText}
                  />
                </View>
              ) : (
                <View style={styles.badgesGrid}>
                  {badges.slice(0, 4).map((badge) => (
                    <View
                      key={badge.id}
                      style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
                    >
                      <View style={styles.badgeIconWrap}>
                        <Ionicons
                          name={badge.icon as any}
                          size={32}
                          color={badge.earned ? Colors.warning : theme.textLight}
                        />
                      </View>
                      <View style={styles.badgeTextWrap}>
                        <Text style={styles.badgeTitle}>{badge.title}</Text>
                        <Text style={styles.badgeSubtitle}>{badge.description}</Text>
                      </View>
                      {badge.earned && (
                        <View style={styles.earnedTag}>
                          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </AnimatedCard>

            {badges.length > 4 && (
              <AnimatedCard delay={200} type="slide" style={styles.section}>
                <SectionTitle title={`All Badges (${badges.filter((b) => b.earned).length}/${badges.length})`} />
                <View style={styles.badgesGrid}>
                  {badges.slice(4).map((badge) => (
                    <View
                      key={badge.id}
                      style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
                    >
                      <View style={styles.badgeIconWrap}>
                        <Ionicons
                          name={badge.icon as any}
                          size={32}
                          color={badge.earned ? Colors.warning : theme.textLight}
                        />
                      </View>
                      <View style={styles.badgeTextWrap}>
                        <Text style={styles.badgeTitle}>{badge.title}</Text>
                        <Text style={styles.badgeSubtitle}>{badge.description}</Text>
                      </View>
                      {badge.earned && (
                        <View style={styles.earnedTag}>
                          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </AnimatedCard>
            )}
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
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    ...fontStyles.h3,
    color: theme.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 4,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: theme.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTabText: {
    color: theme.white,
  },
  card: {
    backgroundColor: theme.white,
    borderRadius: 28,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  questTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIcon: {
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
  questMain: {
    flex: 1,
  },
  questTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 2,
    flex: 1,
  },
  xpPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: theme.primary + '15',
    borderWidth: 2,
    borderColor: theme.primary + '25',
  },
  xpText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.primary,
  },
  questMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12,
  },
  questMeta: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
  },
  questPercent: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.text,
  },
  progressTrack: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 8,
    backgroundColor: theme.primary,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  divider: {
    height: 2,
    backgroundColor: '#F0F0F0',
    marginVertical: 24,
    borderRadius: 1,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: '48%',
    backgroundColor: theme.white,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.border,
    padding: 16,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 8,
  },
  badgeCardLocked: {
    opacity: 0.6,
    backgroundColor: '#F8F9FA',
  },
  badgeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
    marginBottom: 4,
  },
  badgeTextWrap: {
    alignItems: 'center',
  },
  badgeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
    fontWeight: '700',
  },
  resultsList: {
    gap: 16,
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 8,
    gap: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.text,
  },
  resultMain: {
    flex: 1,
  },
  resultName: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.text,
  },
  resultBio: {
    fontSize: 13,
    color: theme.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  miniFollowBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.white,
    borderWidth: 2,
    borderColor: theme.primary,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniFollowBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  leaderRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  rowDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: '#F0F0F0',
  },
  rankPill: {
    minWidth: 48,
    height: 36,
    borderRadius: 14,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.primary + '25',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '900',
    color: theme.primary,
  },
  leaderMain: {
    flex: 1,
  },
  leaderName: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.text,
    marginBottom: 2,
  },
  leaderMeta: {
    fontSize: 13,
    color: theme.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  avatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 4,
  },
  avatarTextSmall: {
    fontSize: 16,
    fontWeight: '900',
    color: theme.text,
  },
  activityMain: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  activityName: {
    fontWeight: '900',
    color: theme.primary,
  },
  activityTime: {
    fontSize: 12,
    color: theme.textLight,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  activityXp: {
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  activityXpText: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.warning,
  },
  emptyFriends: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFriendsTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.text,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emptyFriendsText: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '700',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: theme.white,
    borderRadius: 24,
    padding: 20,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.primary,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  levelText: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.white,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.text,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 2,
    height: 40,
    backgroundColor: theme.border,
    borderRadius: 1,
  },
  streakBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  streakValue: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.warning,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: theme.textSecondary,
  },
  claimButton: {
    backgroundColor: Colors.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.success,
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    minWidth: 100,
    alignItems: 'center',
  },
  claimButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: theme.white,
    letterSpacing: 0.5,
  },
  claimedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  claimedText: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.success,
  },
  earnedTag: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  leaderboardScopeWrap: {
    flexDirection: 'row',
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 4,
    borderWidth: 2,
    borderColor: theme.border,
    borderBottomWidth: 6,
  },
  scopePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  scopePillActive: {
    backgroundColor: theme.primary,
  },
  scopePillText: {
    fontSize: 13,
    fontWeight: '900',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scopePillTextActive: {
    color: theme.white,
  },
  });
}
