import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  Share,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Post, postApi } from '../utils/api';
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
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const BADGE_GRADIENTS: Record<number, [string, string]> = {
  3: ['#F5C518', '#F28D35'],
  2: ['#B0B0B0', '#787878'],
  1: ['#D4874A', '#A0522D'],
};
const TYPE_GRADIENTS: Record<string, [string, string]> = {
  streak:   ['#FF6B35', '#FF3D00'],
  goal:     ['#2F593E', '#4CAF50'],
  xp_level: ['#5B6AF0', '#C05FF0'],
  badge:    BADGE_GRADIENTS[1],
};
const TYPE_ICONS: Record<string, string> = {
  streak: '🔥', goal: '🎯', xp_level: '⚡', badge: '🏅',
};

interface Props {
  post: Post;
  currentUserId?: string;
  onCommentPress: (post: Post) => void;
  onDeleted?: (postId: string) => void;
}

export default function PostCard({ post, currentUserId, onCommentPress, onDeleted }: Props) {
  const { theme } = useTheme();
  const router = useRouter();
  const [reacted, setReacted] = useState(post.i_reacted);
  const [reactionCount, setReactionCount] = useState(post.reaction_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [saved, setSaved] = useState(post.i_saved);

  React.useEffect(() => { setCommentCount(post.comment_count); }, [post.comment_count]);
  const [imageFailed, setImageFailed] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const heartAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const lastTap = useRef(0);
  const isMe = post.user_id === currentUserId;

  const gradient: [string, string] =
    post.post_type === 'badge'
      ? (BADGE_GRADIENTS[post.metadata?.badge_tier ?? 1] ?? BADGE_GRADIENTS[1])
      : (TYPE_GRADIENTS[post.post_type] ?? BADGE_GRADIENTS[1]);

  const timeAgo = (() => {
    try { return formatDistanceToNow(new Date(post.created_at), { addSuffix: true }); }
    catch { return ''; }
  })();

  const handleReact = async (isDoubleTap = false) => {
    if (isDoubleTap && reacted) {
      // If already reacted, just show animation
      showHeartAnimation();
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    if (isDoubleTap) showHeartAnimation();
    
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    const next = isDoubleTap ? true : !reacted;
    if (next === reacted && !isDoubleTap) return;
    
    setReacted(next);
    setReactionCount(c => c + (next ? (reacted ? 0 : 1) : -1));
    try {
      await postApi.toggleReaction(post.id);
    } catch {
      setReacted(!next);
      setReactionCount(c => c + (next ? -1 : 1));
    }
  };

  const showHeartAnimation = () => {
    setShowHeart(true);
    heartAnim.setValue(0);
    Animated.sequence([
      Animated.spring(heartAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      Animated.timing(heartAnim, { toValue: 0, duration: 200, delay: 500, useNativeDriver: true }),
    ]).start(() => setShowHeart(false));
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      handleReact(true);
    }
    lastTap.current = now;
  };

  const handleComment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onCommentPress(post);
  };

  const handleShare = async () => {
    try {
      const lines: string[] = [];
      if (post.caption) lines.push(post.caption);
      if (post.media[0]?.media_url) lines.push(post.media[0].media_url);
      await Share.share({
        message: lines.join('\n') || `Check out ${post.author_name}'s post on NutriSnap!`,
        title: 'NutriSnap',
      });
    } catch { /* cancelled */ }
  };

  const handleOptions = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowOptions(true);
  };

  const confirmDelete = () => {
    setShowOptions(false);
    Alert.alert('Delete Post', 'Remove this from your feed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await postApi.deletePost(post.id);
            onDeleted?.(post.id);
          } catch {
            Alert.alert('Error', 'Could not delete post.');
          }
        },
      },
    ]);
  };

  const primaryMedia = post.media[0];
  const photoUri = (() => {
    const uri = primaryMedia?.media_url;
    if (!uri || typeof uri !== 'string') return undefined;
    if (uri.startsWith('http://')) return uri.replace('http://', 'https://');
    return uri;
  })();

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        activeOpacity={isMe ? 1 : 0.75}
        onPress={isMe ? undefined : () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          router.push(`/public-profile/${post.user_id}` as any);
        }}
        disabled={isMe}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor(post.author_name) }]}>
          <Text style={styles.avatarText}>{initials(post.author_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>{post.author_name}</Text>
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
        <TouchableOpacity onPress={handleOptions} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#999" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Media */}
      {post.post_type === 'photo' && photoUri && !imageFailed ? (
        <View>
          <TouchableOpacity activeOpacity={1} onPress={handleDoubleTap}>
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              contentFit="cover"
              cachePolicy="none"
              recyclingKey={photoUri}
              onError={(e) => {
                // eslint-disable-next-line no-console
                console.error('Post image failed to load:', { postId: post.id, uri: photoUri, error: e });
                setImageFailed(true);
              }}
            />
            {showHeart && (
              <Animated.View style={[styles.bigHeart, {
                opacity: heartAnim,
                transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }]
              }]}>
                <Ionicons name="flame" size={80} color="#FF3D00" />
              </Animated.View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareOverlay} onPress={handleShare} activeOpacity={0.8}>
            <Ionicons name="arrow-redo-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContent}
        >
          <Text style={styles.gradientEmoji}>
            {post.metadata?.badge_icon ?? TYPE_ICONS[post.post_type] ?? '⚡'}
          </Text>
          {post.metadata?.badge_name && (
            <Text style={styles.gradientTitle}>{post.metadata.badge_name}</Text>
          )}
          {post.metadata?.xp > 0 && (
            <View style={styles.xpPill}>
              <Text style={styles.xpText}>+{post.metadata.xp} XP</Text>
            </View>
          )}
        </LinearGradient>
      )}

      {/* Action row */}
      <View style={styles.actions}>
        {/* Left group: hype · comment · share */}
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleReact()} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <Ionicons name={reacted ? 'flame' : 'flame-outline'} size={22} color={reacted ? '#FF3D00' : '#888'} />
          </Animated.View>
          {reactionCount > 0 && (
            <Text style={[styles.actionCount, reacted && { color: '#FF3D00' }]}>{reactionCount}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleComment} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chatbubble-outline" size={20} color="#888" />
          {commentCount > 0 && (
            <Text style={styles.actionCount}>{commentCount}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-redo-outline" size={20} color="#888" />
        </TouchableOpacity>

        {/* Right: bookmark */}
        <TouchableOpacity
          style={styles.saveBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            const next = !saved;
            setSaved(next);
            try { await postApi.toggleSave(post.id); }
            catch { setSaved(!next); }
          }}
        >
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? Colors.primary : '#888'} />
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.caption ? (
        <Text style={styles.captionText} numberOfLines={3}>
          <Text style={styles.captionAuthor}>{post.author_name.split(' ')[0]} </Text>
          {post.caption}
        </Text>
      ) : null}

      {/* Custom options sheet */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={styles.optionsBackdrop} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <View style={styles.optionsSheet}>
            <View style={styles.optionsHandle} />

            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.75}
              onPress={() => { setShowOptions(false); handleShare(); }}
            >
              <View style={[styles.optionIcon, { backgroundColor: Colors.primary + '18' }]}>
                <Ionicons name="arrow-redo-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.optionLabel}>Share</Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </TouchableOpacity>

            {isMe && (
              <>
                <View style={styles.optionDivider} />
                <TouchableOpacity style={styles.optionRow} activeOpacity={0.75} onPress={confirmDelete}>
                  <View style={[styles.optionIcon, { backgroundColor: '#FF3D0018' }]}>
                    <Ionicons name="trash-outline" size={20} color="#FF3D00" />
                  </View>
                  <Text style={[styles.optionLabel, { color: '#FF3D00' }]}>Delete Post</Text>
                  <Ionicons name="chevron-forward" size={16} color="#ccc" />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.optionRow, styles.optionCancel]}
              activeOpacity={0.75}
              onPress={() => setShowOptions(false)}
            >
              <Text style={styles.optionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e8e8e8',
    borderBottomWidth: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  avatarText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  authorName: { fontSize: 15, fontWeight: '900', color: '#111' },
  timeAgo: { fontSize: 12, fontWeight: '700', color: '#999', marginTop: 1 },

  photo: { width: '100%', height: 300 },
  shareOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 20,
    padding: 7,
  },
  bigHeart: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 10,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },

  gradientContent: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  gradientEmoji: { fontSize: 52 },
  gradientTitle: { fontSize: 18, fontWeight: '900', color: '#fff', textAlign: 'center' },
  xpPill: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  xpText: { fontSize: 13, fontWeight: '900', color: '#fff' },

  captionText: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    fontSize: 14,
    color: '#222',
    lineHeight: 20,
    fontWeight: '400',
  },
  captionAuthor: { fontWeight: '900', color: '#111' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
  },
  saveBtn: {
    marginLeft: 'auto',
  },

  // Options modal
  optionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 32,
    paddingTop: 8,
    borderTopWidth: 2,
    borderColor: '#e8e8e8',
  },
  optionsHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  optionIcon: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  optionDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 20,
  },
  optionCancel: {
    justifyContent: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  optionCancelText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#888',
    flex: 1,
    textAlign: 'center',
  },
});
