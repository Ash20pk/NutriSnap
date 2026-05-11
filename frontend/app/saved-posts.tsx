import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Post, postApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import PostCard from '../components/PostCard';
import CommentsSheet from '../components/CommentsSheet';

export default function SavedPostsScreen() {
  const { theme } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);

  const load = useCallback(async (cursor?: string) => {
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const data = await postApi.getSavedPosts(cursor);
      setPosts(prev => cursor ? [...prev, ...(data.posts || [])] : (data.posts || []));
      setNextCursor(data.next_cursor);
    } catch (e) {
      console.error('Saved posts error:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); router.back(); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Saved</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.primary} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              currentUserId={user?.id}
              onCommentPress={setCommentPost}
              onDeleted={id => setPosts(prev => prev.filter(p => p.id !== id))}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={48} color={theme.textLight} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No saved posts yet</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                Tap the bookmark on any post to save it here
              </Text>
            </View>
          }
          onEndReached={() => { if (nextCursor && !loadingMore) load(nextCursor); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 12 }} /> : null}
        />
      )}

      <CommentsSheet
        visible={!!commentPost}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={postId => {
          setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  title: { fontSize: 18, fontWeight: '900' },
  list: { paddingTop: 12, paddingBottom: 100 },
  empty: {
    alignItems: 'center',
    gap: 12,
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
});
