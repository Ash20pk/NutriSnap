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

type LocalComment = PostComment & {
  isOptimistic?: boolean;
  isDeleting?: boolean;
  replies?: LocalComment[];
  repliesOpen?: boolean;
  repliesLoading?: boolean;
};

export default function CommentsSheet({ visible, post, onClose }: Props) {
  const { user } = useUser();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
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
      setReplyingTo(null);
      setBody('');
      loadComments();
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 700, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, post]);

  const handleSend = async () => {
    if (!body.trim() || !post || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const trimmed = body.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: LocalComment = {
      id: tempId,
      post_id: post.id,
      user_id: user?.id ?? '',
      author_name: user?.name ?? 'Me',
      author_username: null,
      body: trimmed,
      created_at: new Date().toISOString(),
      parent_id: replyingTo?.id ?? null,
      reply_count: 0,
      like_count: 0,
      i_liked: false,
      isOptimistic: true,
    };

    const parentId = replyingTo?.id;
    setBody('');
    setReplyingTo(null);

    if (parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies ?? []), optimistic], repliesOpen: true }
          : c
      ));
    } else {
      setComments(prev => [...prev, optimistic]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }

    try {
      const comment = await postApi.createComment(post.id, trimmed, parentId);
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? {
                ...c,
                reply_count: c.reply_count + 1,
                replies: (c.replies ?? []).map(r => r.id === tempId ? comment : r),
              }
            : c
        ));
      } else {
        setComments(prev => prev.map(c => c.id === tempId ? comment : c));
      }
    } catch (e) {
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, replies: (c.replies ?? []).filter(r => r.id !== tempId) }
            : c
        ));
      } else {
        setComments(prev => prev.filter(c => c.id !== tempId));
        setBody(trimmed);
      }
      console.error('Comment failed:', e);
    }
  };

  const handleLoadReplies = async (comment: LocalComment) => {
    if (!post) return;
    if (comment.repliesOpen && comment.replies) {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, repliesOpen: false } : c));
      return;
    }
    setComments(prev => prev.map(c => c.id === comment.id ? { ...c, repliesLoading: true } : c));
    try {
      const data = await postApi.getReplies(post.id, comment.id);
      setComments(prev => prev.map(c =>
        c.id === comment.id
          ? { ...c, replies: data.replies, repliesOpen: true, repliesLoading: false }
          : c
      ));
    } catch {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, repliesLoading: false } : c));
    }
  };

  const handleToggleLike = async (comment: LocalComment, isReply: boolean, parentId?: string) => {
    if (!post || comment.isOptimistic) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const updateComment = (c: LocalComment): LocalComment => {
      if (c.id !== comment.id) return c;
      const next = !c.i_liked;
      return { ...c, i_liked: next, like_count: c.like_count + (next ? 1 : -1) };
    };

    if (isReply && parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId ? { ...c, replies: (c.replies ?? []).map(updateComment) } : c
      ));
    } else {
      setComments(prev => prev.map(updateComment));
    }

    try {
      await postApi.toggleCommentReaction(post.id, comment.id);
    } catch {
      // rollback
      const rollback = (c: LocalComment): LocalComment => {
        if (c.id !== comment.id) return c;
        return { ...c, i_liked: comment.i_liked, like_count: comment.like_count };
      };
      if (isReply && parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId ? { ...c, replies: (c.replies ?? []).map(rollback) } : c
        ));
      } else {
        setComments(prev => prev.map(rollback));
      }
    }
  };

  const handleDelete = async (comment: LocalComment, parentId?: string) => {
    if (!post || comment.isOptimistic || comment.isDeleting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (parentId) {
      setComments(prev => prev.map(c =>
        c.id === parentId
          ? { ...c, replies: (c.replies ?? []).map(r => r.id === comment.id ? { ...r, isDeleting: true } : r) }
          : c
      ));
    } else {
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, isDeleting: true } : c));
    }

    try {
      await postApi.deleteComment(post.id, comment.id);
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId
            ? { ...c, reply_count: Math.max(0, c.reply_count - 1), replies: (c.replies ?? []).filter(r => r.id !== comment.id) }
            : c
        ));
      } else {
        setComments(prev => prev.filter(c => c.id !== comment.id));
      }
    } catch {
      const undoDeleting = (c: LocalComment) =>
        c.id === comment.id ? { ...c, isDeleting: false } : c;
      if (parentId) {
        setComments(prev => prev.map(c =>
          c.id === parentId ? { ...c, replies: (c.replies ?? []).map(undoDeleting) } : c
        ));
      } else {
        setComments(prev => prev.map(undoDeleting));
      }
    }
  };

  const triggerReply = (comment: LocalComment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const firstName = comment.author_name.split(' ')[0];
    setReplyingTo({ id: comment.id, name: firstName });
    setBody(`@${firstName} `);
    inputRef.current?.focus();
  };

  const renderCommentRow = (
    item: LocalComment,
    isReply = false,
    parentId?: string,
  ) => {
    const timeAgo = (() => {
      try { return formatDistanceToNow(new Date(item.created_at), { addSuffix: true }); }
      catch { return ''; }
    })();
    const isMe = item.user_id === user?.id;

    return (
      <View key={item.id} style={[styles.commentRow, isReply && styles.replyRow, item.isDeleting && { opacity: 0.4 }]}>
        <View style={[styles.avatar, { backgroundColor: avatarColor(item.author_name) }]}>
          <Text style={styles.avatarText}>{initials(item.author_name)}</Text>
        </View>

        <View style={styles.commentContent}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleAuthor}>{item.author_name.split(' ')[0]}</Text>
            <Text style={styles.bubbleText}>{item.body}</Text>
          </View>

          {/* Meta row */}
          <View style={styles.metaRow}>
            <Text style={styles.metaTime}>{item.isOptimistic ? 'Sending…' : timeAgo}</Text>
            {!item.isOptimistic && (
              <>
                {item.like_count > 0 && (
                  <Text style={styles.metaLikes}>{item.like_count} {item.like_count === 1 ? 'hype' : 'hypes'}</Text>
                )}
                <TouchableOpacity onPress={() => triggerReply(item)}>
                  <Text style={styles.metaAction}>Reply</Text>
                </TouchableOpacity>
                {isMe && (
                  <TouchableOpacity onPress={() => handleDelete(item, parentId)}>
                    <Text style={[styles.metaAction, { color: '#FF3D00' }]}>
                      {item.isDeleting ? 'Deleting…' : 'Delete'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* View replies toggle (top-level only) */}
          {!isReply && item.reply_count > 0 && (
            <TouchableOpacity style={styles.viewRepliesBtn} onPress={() => handleLoadReplies(item)}>
              {item.repliesLoading ? (
                <ActivityIndicator size="small" color="#aaa" />
              ) : (
                <>
                  <View style={styles.viewRepliesLine} />
                  <Text style={styles.viewRepliesText}>
                    {item.repliesOpen ? 'Hide replies' : `View ${item.reply_count} ${item.reply_count === 1 ? 'reply' : 'replies'}`}
                  </Text>
                  <Ionicons
                    name={item.repliesOpen ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color="#888"
                  />
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Replies sub-list */}
          {!isReply && item.repliesOpen && item.replies?.map(reply =>
            renderCommentRow(reply, true, item.id)
          )}
        </View>

        {/* Hype button (right side) */}
        {!item.isOptimistic && (
          <TouchableOpacity
            style={styles.likeBtn}
            onPress={() => handleToggleLike(item, isReply, parentId)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={item.i_liked ? 'flame' : 'flame-outline'}
              size={16}
              color={item.i_liked ? '#FF3D00' : '#bbb'}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!post) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.handle} />

            {/* Post caption */}
            {post.caption ? (
              <View style={styles.postCaption}>
                <Text style={styles.captionAuthor}>{post.author_name.split(' ')[0]}</Text>
                <Text style={styles.captionBody}> {post.caption}</Text>
              </View>
            ) : null}

            {/* Comments */}
            {loading ? (
              <ActivityIndicator style={{ marginTop: 32 }} color={Colors.primary} />
            ) : (
              <FlatList
                ref={flatRef}
                data={comments}
                keyExtractor={c => c.id}
                renderItem={({ item }) => renderCommentRow(item)}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.empty}>No comments yet. Be the first!</Text>
                }
                onEndReached={() => { if (nextCursor && !loadingMore) loadComments(nextCursor); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.primary} /> : null}
                keyboardShouldPersistTaps="handled"
              />
            )}

            {/* Replying-to bar */}
            {replyingTo && (
              <View style={styles.replyBar}>
                <Text style={styles.replyBarText}>Replying to <Text style={{ fontWeight: '900' }}>@{replyingTo.name}</Text></Text>
                <TouchableOpacity onPress={() => { setReplyingTo(null); setBody(''); }}>
                  <Ionicons name="close" size={16} color="#888" />
                </TouchableOpacity>
              </View>
            )}

            {/* Input */}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={replyingTo ? `Reply to @${replyingTo.name}…` : 'Add a comment…'}
                placeholderTextColor="#aaa"
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={2200}
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnOff]}
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
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    height: '82%',
    paddingTop: 8,
    borderTopWidth: 2, borderColor: '#e8e8e8',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 10,
  },
  postCaption: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  captionAuthor: { fontSize: 14, fontWeight: '900', color: '#111' },
  captionBody: { fontSize: 14, fontWeight: '500', color: '#333', lineHeight: 20, flex: 1 },

  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 18 },
  empty: { textAlign: 'center', color: '#aaa', fontWeight: '600', fontSize: 14, marginTop: 32 },

  // Comment row
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  replyRow: { marginLeft: 50, marginTop: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  commentContent: { flex: 1, gap: 5 },
  bubble: {
    backgroundColor: '#f5f5f5', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8, gap: 1,
  },
  bubbleAuthor: { fontSize: 13, fontWeight: '900', color: '#111' },
  bubbleText: { fontSize: 14, color: '#333', lineHeight: 19, fontWeight: '500' },

  // Meta row (time · likes · Reply · Delete)
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 4 },
  metaTime: { fontSize: 12, color: '#bbb', fontWeight: '600' },
  metaLikes: { fontSize: 12, color: '#888', fontWeight: '700' },
  metaAction: { fontSize: 12, color: '#555', fontWeight: '800' },

  // View replies
  viewRepliesBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 4 },
  viewRepliesLine: { width: 24, height: 1.5, backgroundColor: '#ddd' },
  viewRepliesText: { fontSize: 12, fontWeight: '800', color: '#888' },

  // Hype button
  likeBtn: { paddingTop: 10, paddingLeft: 4 },

  // Reply bar
  replyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#f8f8f8', borderTopWidth: 1, borderTopColor: '#eee',
  },
  replyBarText: { fontSize: 13, color: '#666', fontWeight: '600' },

  // Input
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
    maxHeight: 100, borderWidth: 1.5, borderColor: '#e8e8e8',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: '#ccc' },
});
