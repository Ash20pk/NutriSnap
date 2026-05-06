import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';
import PageHeader from '../components/PageHeader';
import { socialApi } from '../utils/api';
import UserRow from '../components/UserRow';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

type UserListItem = {
  id: string;
  name: string;
  username?: string;
  avatar_url?: string;
};

export default function FollowingScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [following, setFollowing] = React.useState<UserListItem[]>([]);

  const fetchFollowing = React.useCallback(async () => {
    try {
      const res = await socialApi.getMyFollowing();
      setFollowing(res.following || []);
    } catch (e) {
      console.error('Error fetching following:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchFollowing();
  }, [fetchFollowing]);

  return (
    <View style={styles.container}>
      <PageHeader title="Following" subtitle="People you follow" showBack />

      {loading ? (
        <LoadingState label="Loading following..." />
      ) : (
        <FlatList
          data={following}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchFollowing();
              }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="person-add-outline"
              title="Not following anyone yet"
              subtitle="Find friends in Quests → Ranks to start following."
            />
          }
          renderItem={({ item }) => (
            <UserRow
              title={item.name || 'User'}
              subtitle={item.username ? `@${item.username}` : undefined}
              avatar={{
                text: (item.name || item.username || 'U')[0].toUpperCase(),
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(`/public-profile/${item.id}` as any);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function makeStyles(theme: typeof Colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  });
}
