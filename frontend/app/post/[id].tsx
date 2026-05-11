import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const styles = makeStyles(theme);

  const [post, setPost] = useState<Post | null>(() => {
    try {
      return params.post ? JSON.parse(params.post as string) as Post : null;
    } catch {
      return null;
    }
  });
  const [commentPost, setCommentPost] = useState<Post | null>(null);

  if (!post) {
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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={[styles.flex, { paddingHorizontal: 16, paddingTop: 16 }]}>
        <PostCard
          post={post}
          currentUserId={user?.id}
          onCommentPress={setCommentPost}
          onDeleted={() => router.back()}
        />
        <View style={{ height: 100 }} />
      </ScrollView>

      <CommentsSheet
        visible={!!commentPost}
        post={commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={postId => {
          if (post.id === postId) {
            setPost({ ...post, comment_count: post.comment_count + 1 });
          }
        }}
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
    flex: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 12,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border + '40',
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
