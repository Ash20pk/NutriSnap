import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Post, PostComment, postApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

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

interface Props {
  visible: boolean;
  post: Post | null;
  onClose: () => void;
}

export default function CommentsSheet({ visible, post, onClose }: Props) {
  const { theme } = useTheme();
  const { user } = useUser();
  const slideAnim = useRef(new Animated.Value(600)).current;
  const [comments, setComments] = useState<PostComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const flatRef = useRef<FlatList>(null);

  const loadComments = useCallback(async (cursor?: string) => {
    if (!post) return;
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const data = await postApi.getComments(post.id, cursor);
      setComments(prev => cursor ? [...prev, ...data.comments] : data.comments);
      setNextCursor(data.next_cursor);
    } catch (e) {
      console.error('Failed to load comments:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [post]);

  useEffect(() => {
    if (visible && post) {
      setComments([]);
      setNextCursor(null);
      loadComments();
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, post]);

  const handleSend = async () => {
    if (!body.trim() || !post || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSending(true);
    const trimmed = body.trim();
    setBody('');
    try {
      const comment = await postApi.createComment(post.id, trimmed);
      setComments(prev => [...prev, comment]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setBody(trimmed);
      console.error('Comment failed:', e);
    } finally {
      setSending(false);
    }
  };

  const renderComment = ({ item }: { item: PostComment }) => {
    const timeAgo = (() => {
      try { return formatDistanceToNow(new Date(item.created_at), { addSuffix: true }); }
      catch { return ''; }
    })();
    const isMe = item.user_id === user?.id;

    return (
      <View style={styles.comment}>
        <View style={[styles.commentAvatar, { backgroundColor: avatarColor(item.author_name) }]}>
          <Text style={styles.commentAvatarText}>{initials(item.author_name)}</Text>
        </View>
        <View style={styles.commentBody}>
          <View style={styles.commentBubble}>
            <Text style={styles.commentAuthor}>{item.author_name.split(' ')[0]}</Text>
            <Text style={styles.commentText}>{item.body}</Text>
          </View>
          <View style={styles.commentMeta}>
            <Text style={styles.commentTime}>{timeAgo}</Text>
            {isMe && (
              <TouchableOpacity
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  await postApi.deleteComment(post!.id, item.id);
                  setComments(prev => prev.filter(c => c.id !== item.id));
                }}
              >
                <Text style={styles.commentDelete}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Post caption at top (like Instagram) */}
          {post.caption ? (
            <View style={styles.postCaption}>
              <Text style={styles.postCaptionAuthor}>{post.author_name.split(' ')[0]}</Text>
              <Text style={styles.postCaptionText}> {post.caption}</Text>
            </View>
          ) : null}

          {/* Comments list */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            {loading ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={Colors.primary} />
            ) : (
              <FlatList
                ref={flatRef}
                data={comments}
                keyExtractor={c => c.id}
                renderItem={renderComment}
                contentContainerStyle={styles.commentList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.emptyComments}>No comments yet. Be the first!</Text>
                }
                onEndReached={() => { if (nextCursor && !loadingMore) loadComments(nextCursor); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.primary} /> : null}
              />
            )}

            {/* Input */}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Add a comment…"
                placeholderTextColor="#aaa"
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={2200}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!body.trim() || sending}
                activeOpacity={0.8}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={16} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '80%',
    paddingTop: 8,
    borderTopWidth: 2,
    borderColor: '#e8e8e8',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 12,
  },
  postCaption: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 4,
  },
  postCaptionAuthor: { fontSize: 14, fontWeight: '900', color: '#111' },
  postCaptionText: { fontSize: 14, fontWeight: '500', color: '#333', lineHeight: 20, flex: 1 },
  commentList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 16 },
  emptyComments: { textAlign: 'center', color: '#aaa', fontWeight: '600', fontSize: 14, marginTop: 32 },
  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentAvatar: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  commentAvatarText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  commentBody: { flex: 1, gap: 4 },
  commentBubble: {
    backgroundColor: '#f5f5f5', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  commentAuthor: { fontSize: 13, fontWeight: '900', color: '#111' },
  commentText: { fontSize: 14, color: '#333', lineHeight: 19, fontWeight: '500' },
  commentMeta: { flexDirection: 'row', gap: 12, paddingLeft: 4 },
  commentTime: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  commentDelete: { fontSize: 12, color: '#FF3D00', fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1.5, borderTopColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1, backgroundColor: '#f5f5f5', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: '#111', fontWeight: '500',
    maxHeight: 100,
    borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#ccc' },
});
