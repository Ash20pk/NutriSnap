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

export default function FollowersScreen() {
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [followers, setFollowers] = React.useState<UserListItem[]>([]);

  const fetchFollowers = React.useCallback(async () => {
    try {
      const res = await socialApi.getMyFollowers();
      setFollowers(res.followers || []);
    } catch (e) {
      console.error('Error fetching followers:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchFollowers();
  }, [fetchFollowers]);

  return (
    <View style={styles.container}>
      <PageHeader title="Followers" subtitle="People following you" showBack />

      {loading ? (
        <LoadingState label="Loading followers..." />
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchFollowers();
              }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No followers yet"
              subtitle="When people follow you, they’ll show up here."
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
