import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Post } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/UserContext';
import PostCard from '../../components/PostCard';
import CommentsSheet from '../../components/CommentsSheet';

export default function PostDetailScreen() {
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);

  const initialIndex = params.initialIndex ? parseInt(params.initialIndex as string, 10) : 0;

  const [posts, setPosts] = useState<Post[]>(() => {
    try {
      if (params.posts) return JSON.parse(params.posts as string) as Post[];
      if (params.post) return [JSON.parse(params.post as string) as Post];
      return [];
    } catch {
      return [];
    }
  });

  const [commentPost, setCommentPost] = useState<Post | null>(null);

  const handleCommentAdded = useCallback((postId: string) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
    ));
  }, []);

  const handleDeleted = useCallback((postId: string) => {
    const remaining = posts.filter(p => p.id !== postId);
    if (remaining.length === 0) {
      router.back();
    } else {
      setPosts(remaining);
    }
  }, [posts, router]);

  const renderItem = useCallback(({ item }: { item: Post }) => (
    <View style={styles.cardWrapper}>
      <PostCard
        post={item}
        currentUserId={user?.id}
        onCommentPress={setCommentPost}
        onDeleted={() => handleDeleted(item.id)}
      />
    </View>
  ), [user?.id, handleDeleted, styles]);

  if (posts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Post not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Posts</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
      />

      <CommentsSheet
        visible={!!commentPost}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={handleCommentAdded}
      />
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border + '40',
      zIndex: 10,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: theme.text,
    },
    closeBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
    },
    cardWrapper: {
      marginBottom: 8,
    },
    errorText: {
      fontSize: 16,
      color: theme.textSecondary,
      marginBottom: 16,
      fontWeight: '600',
    },
    backBtn: {
      backgroundColor: theme.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    backBtnText: {
      color: '#fff',
      fontWeight: '800',
    },
  });
}
