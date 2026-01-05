import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Colors } from '../../constants/Colors';
import { fontStyles } from '../../constants/Fonts';
import PageHeader from '../../components/PageHeader';
import { Ionicons } from '@expo/vector-icons';
import DuoButton from '../../components/DuoButton';
import AnimatedCard from '../../components/AnimatedCard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

const MOCK_QUESTS = [
  {
    id: 'q1',
    title: 'Log 2 meals',
    xp: 20,
    current: 1,
    target: 2,
    icon: 'checkmark-circle',
    iconColor: Colors.primary,
  },
  {
    id: 'q2',
    title: 'Hit your protein target',
    xp: 35,
    current: 60,
    target: 120,
    icon: 'nutrition',
    iconColor: Colors.secondary,
    unit: 'g',
  },
  {
    id: 'q3',
    title: 'Stay under your calorie target',
    xp: 25,
    current: 1420,
    target: 2000,
    icon: 'flame',
    iconColor: Colors.accent,
    unit: 'kcal',
  },
];

const MOCK_BADGES = [
  { id: 'b1', title: 'First Log', subtitle: 'Log your first meal', icon: 'sparkles', earned: true },
  { id: 'b2', title: 'Protein Pro', subtitle: 'Hit protein 3 days', icon: 'fitness', earned: false },
  { id: 'b3', title: 'Streak Starter', subtitle: '3-day streak', icon: 'flame', earned: true },
  { id: 'b4', title: 'Macro Master', subtitle: 'Hit all macros once', icon: 'pie-chart', earned: false },
];

const MOCK_LEADERBOARD = [
  { id: '1', name: 'Aarav', scoreLabel: 'Protein', scoreValue: '142g avg', rank: 1 },
  { id: '2', name: 'Diya', scoreLabel: 'Carbs', scoreValue: '210g avg', rank: 2 },
  { id: '3', name: 'Kabir', scoreLabel: 'Calories', scoreValue: '1,980 kcal', rank: 3 },
  { id: '4', name: 'Meera', scoreLabel: 'Consistency', scoreValue: '6-day streak', rank: 4 },
];

const MOCK_SEARCH_RESULTS = [
  { id: 's1', name: 'Ishaan', bio: 'Living healthy!', isFollowing: false },
  { id: 's2', name: 'Zoya', bio: 'Macros tracking ninja 🥷', isFollowing: true },
  { id: 's3', name: 'Arjun', bio: 'Fitness enthusiast', isFollowing: false },
];

const MOCK_FRIENDS_ACTIVITY = [
  { id: 'a1', name: 'Zoya', type: 'log', detail: 'Logged a healthy Breakfast', xp: 25, time: '2h ago' },
  { id: 'a2', name: 'Aarav', type: 'quest', detail: 'Completed "Protein Pro" quest', xp: 50, time: '4h ago' },
  { id: 'a3', name: 'Arjun', type: 'streak', detail: 'Hit a 7-day streak! 🔥', xp: 100, time: '6h ago' },
];

export default function QuestScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<'quests' | 'friends'>('quests');
  const [searchQuery, setSearchQuery] = React.useState('');

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
      >
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'quests' && styles.activeTab]}
            activeOpacity={0.9}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveTab('quests');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'quests' && styles.activeTabText]}>Quests</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            activeOpacity={0.9}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setActiveTab('friends');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>Friends</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'quests' ? (
          <>
            <AnimatedCard delay={100} type="pop" style={styles.section}>
              <Text style={styles.sectionTitle}>Today&apos;s quests</Text>
              <View style={styles.card}>
                {MOCK_QUESTS.map((quest, index) => (
                  <View key={quest.id}>
                    <View style={styles.questTopRow}>
                      <View style={[styles.cardIcon, { backgroundColor: quest.iconColor + '15' }]}>
                        <Ionicons name={quest.icon as any} size={24} color={quest.iconColor} />
                      </View>
                      <View style={styles.questMain}>
                        <View style={styles.questTitleRow}>
                          <Text style={styles.cardTitle}>{quest.title}</Text>
                          <View style={styles.xpPill}>
                            <Text style={styles.xpText}>+{quest.xp} XP</Text>
                          </View>
                        </View>
                        <View style={styles.questMetaRow}>
                          <Text style={styles.questMeta}>
                            {quest.current}{quest.unit || ''} / {quest.target}{quest.unit || ''}
                          </Text>
                          <Text style={styles.questPercent}>
                            {Math.round((quest.current / quest.target) * 100)}%
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View 
                            style={[
                              styles.progressFill, 
                              { 
                                width: `${Math.min(100, (quest.current / quest.target) * 100)}%`,
                                backgroundColor: quest.iconColor
                              }
                            ]} 
                          />
                        </View>
                      </View>
                    </View>
                    {index !== MOCK_QUESTS.length - 1 && <View style={styles.divider} />}
                  </View>
                ))}
              </View>
            </AnimatedCard>

            <AnimatedCard delay={200} type="slide" style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Badges</Text>
              <View style={styles.badgesGrid}>
                {MOCK_BADGES.map((badge) => (
                  <View 
                    key={badge.id} 
                    style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
                  >
                    <View style={styles.badgeIconWrap}>
                      <Ionicons 
                        name={badge.icon as any} 
                        size={32} 
                        color={badge.earned ? Colors.warning : Colors.textLight} 
                      />
                    </View>
                    <View style={styles.badgeTextWrap}>
                      <Text style={styles.badgeTitle}>{badge.title}</Text>
                      <Text style={styles.badgeSubtitle}>{badge.subtitle}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </AnimatedCard>
          </>
        ) : (
          <>
            <AnimatedCard delay={50} type="pop" style={styles.section}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color={Colors.textLight} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search friends..."
                  placeholderTextColor={Colors.textLight}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color={Colors.textLight} />
                  </TouchableOpacity>
                )}
              </View>
            </AnimatedCard>

            {searchQuery.length > 0 ? (
              <AnimatedCard delay={100} type="slide" style={styles.section}>
                <Text style={styles.sectionTitle}>Search Results</Text>
                <View style={styles.resultsList}>
                  {MOCK_SEARCH_RESULTS.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).map((result) => (
                    <TouchableOpacity
                      key={result.id}
                      style={styles.searchResultCard}
                      activeOpacity={0.85}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        router.push({
                          pathname: '/public-profile/[id]',
                          params: { id: result.id, name: result.name },
                        });
                      }}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{result.name[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.resultMain}>
                        <Text style={styles.resultName}>{result.name}</Text>
                        <Text style={styles.resultBio} numberOfLines={1}>{result.bio}</Text>
                      </View>
                      <TouchableOpacity 
                        style={[styles.miniFollowBtn, result.isFollowing && styles.miniFollowBtnActive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          // Toggle logic here
                        }}
                      >
                        <Ionicons 
                          name={result.isFollowing ? "checkmark" : "add"} 
                          size={18} 
                          color={result.isFollowing ? Colors.white : Colors.primary} 
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                  {MOCK_SEARCH_RESULTS.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <View style={styles.card}>
                      <View style={styles.emptyFriends}>
                        <Ionicons name="search" size={48} color={Colors.border} />
                        <Text style={styles.emptyFriendsTitle}>No results</Text>
                        <Text style={styles.emptyFriendsText}>We couldn&apos;t find anyone matching &quot;{searchQuery}&quot;</Text>
                      </View>
                    </View>
                  )}
                </View>
              </AnimatedCard>
            ) : (
              <>
                <AnimatedCard delay={100} type="pop" style={styles.section}>
                  <Text style={styles.sectionTitle}>Leaderboard</Text>

                  <View style={styles.card}>
                    {MOCK_LEADERBOARD.map((u, idx) => (
                      <TouchableOpacity
                        key={u.id}
                        style={styles.leaderRow}
                        activeOpacity={0.85}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          router.push({
                            pathname: '/public-profile/[id]',
                            params: { id: u.id, name: u.name },
                          });
                        }}
                      >
                        <View style={styles.rankPill}>
                          <Text style={styles.rankText}>#{u.rank}</Text>
                        </View>

                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{u.name.slice(0, 1).toUpperCase()}</Text>
                        </View>

                        <View style={styles.leaderMain}>
                          <Text style={styles.leaderName}>{u.name}</Text>
                          <Text style={styles.leaderMeta}>
                            {u.scoreLabel} • {u.scoreValue}
                          </Text>
                        </View>

                        <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />

                        {idx !== MOCK_LEADERBOARD.length - 1 && <View style={styles.rowDivider} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </AnimatedCard>

                <AnimatedCard delay={200} type="slide" style={styles.section}>
                  <Text style={styles.sectionTitle}>Friends activity</Text>
                  <View style={styles.card}>
                    {MOCK_FRIENDS_ACTIVITY.map((act, idx) => (
                      <View key={act.id}>
                        <View style={styles.activityRow}>
                          <View style={styles.avatarSmall}>
                            <Text style={styles.avatarTextSmall}>{act.name[0]}</Text>
                          </View>
                          <View style={styles.activityMain}>
                            <Text style={styles.activityText}>
                              <Text style={styles.activityName}>{act.name}</Text> {act.detail}
                            </Text>
                            <Text style={styles.activityTime}>{act.time}</Text>
                          </View>
                          <View style={styles.activityXp}>
                            <Text style={styles.activityXpText}>+{act.xp} XP</Text>
                          </View>
                        </View>
                        {idx !== MOCK_FRIENDS_ACTIVITY.length - 1 && <View style={styles.rowDivider} />}
                      </View>
                    ))}
                    {MOCK_FRIENDS_ACTIVITY.length === 0 && (
                      <View style={styles.emptyFriends}>
                        <Ionicons name="people" size={48} color={Colors.border} />
                        <Text style={styles.emptyFriendsTitle}>No activity yet</Text>
                        <Text style={styles.emptyFriendsText}>Add friends to see their latest logs and recipes!</Text>
                        <DuoButton 
                          title="Invite Friends" 
                          onPress={() => {}} 
                          color={Colors.primary} 
                          size="small"
                          style={{ marginTop: 16 }}
                        />
                      </View>
                    )}
                  </View>
                </AnimatedCard>
              </>
            )}
          </>
        )}

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
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    ...fontStyles.h3,
    color: Colors.text,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 6,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTabText: {
    color: Colors.white,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.border,
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
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
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
    color: Colors.text,
    marginBottom: 2,
    flex: 1,
  },
  xpPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.primary + '15',
    borderWidth: 2,
    borderColor: Colors.primary + '25',
  },
  xpText: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.primary,
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
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  questPercent: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
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
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.white,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.border,
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
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
    marginBottom: 4,
  },
  badgeTextWrap: {
    alignItems: 'center',
  },
  badgeTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '700',
  },
  resultsList: {
    gap: 16,
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 8,
    gap: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  resultMain: {
    flex: 1,
  },
  resultName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
  },
  resultBio: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  miniFollowBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniFollowBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary + '25',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.primary,
  },
  leaderMain: {
    flex: 1,
  },
  leaderName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 2,
  },
  leaderMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderBottomWidth: 4,
  },
  avatarTextSmall: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
  },
  activityMain: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700',
    lineHeight: 20,
  },
  activityName: {
    fontWeight: '900',
    color: Colors.primary,
  },
  activityTime: {
    fontSize: 12,
    color: Colors.textLight,
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
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emptyFriendsText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '700',
  },
});
