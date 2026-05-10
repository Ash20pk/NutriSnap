import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { postApi } from '../utils/api';
import { useUser } from '../context/UserContext';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
}

const MAX_CAPTION = 2200;

export default function CreatePostSheet({ visible, onClose, onPosted }: Props) {
  const { theme } = useTheme();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(800)).current;

  const [image, setImage] = useState<{ uri: string; width?: number; height?: number } | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'pick' | 'compose'>('pick');

  React.useEffect(() => {
    if (visible) {
      setImage(null);
      setCaption('');
      setStep('pick');
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 800, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const pickFromLibrary = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setImage({ uri: a.uri, width: a.width, height: a.height });
      setStep('compose');
    }
  };

  const pickFromCamera = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setImage({ uri: a.uri, width: a.width, height: a.height });
      setStep('compose');
    }
  };

  const handlePost = async () => {
    if (!image || !user || uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setUploading(true);
    try {
      const ext = image.uri.split('.').pop() ?? 'jpg';
      const fileName = `feed/${user.id}/${Date.now()}.${ext}`;

      const resp = await fetch(image.uri);
      const blob = await resp.blob();

      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(fileName, blob, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(fileName);

      await postApi.createPost({
        post_type: 'photo',
        caption: caption.trim() || undefined,
        media_url: urlData.publicUrl,
        media_type: 'image',
        width: image.width,
        height: image.height,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPosted();
      onClose();
    } catch (e) {
      console.error('Post failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setUploading(false);
    }
  };

  const charsLeft = MAX_CAPTION - caption.length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}>
          {/* Handle + top bar */}
          <View style={styles.handle} />
          <View style={styles.topBar}>
            <TouchableOpacity onPress={step === 'compose' ? () => setStep('pick') : onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.topBarCancel}>{step === 'compose' ? 'Back' : 'Cancel'}</Text>
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>New Post</Text>
            {step === 'compose' ? (
              <TouchableOpacity
                style={[styles.postBtn, (!image || uploading) && styles.postBtnDisabled]}
                onPress={handlePost}
                disabled={!image || uploading}
                activeOpacity={0.85}
              >
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.postBtnText}>Share</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}
          </View>

          {step === 'pick' ? (
            /* ── Pick step ── */
            <View style={styles.pickStep}>
              <Ionicons name="images-outline" size={56} color="#ccc" />
              <Text style={styles.pickTitle}>Choose a photo</Text>
              <Text style={styles.pickSub}>Share your fitness journey with the community</Text>
              <TouchableOpacity style={styles.pickBtn} onPress={pickFromLibrary} activeOpacity={0.88}>
                <LinearGradient
                  colors={[Colors.primary, Colors.primary + 'CC']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="images" size={20} color="#fff" />
                <Text style={styles.pickBtnText}>Photo Library</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pickBtn, styles.pickBtnOutline]} onPress={pickFromCamera} activeOpacity={0.88}>
                <Ionicons name="camera" size={20} color={Colors.primary} />
                <Text style={[styles.pickBtnText, { color: Colors.primary }]}>Camera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Compose step ── */
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Preview */}
                {image && (
                  <View style={styles.previewWrap}>
                    <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" />
                    <TouchableOpacity style={styles.changePhoto} onPress={() => setStep('pick')}>
                      <Ionicons name="swap-horizontal" size={14} color="#fff" />
                      <Text style={styles.changePhotoText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Caption */}
                <View style={styles.captionWrap}>
                  <TextInput
                    style={styles.captionInput}
                    placeholder="Write a caption…"
                    placeholderTextColor="#aaa"
                    value={caption}
                    onChangeText={setCaption}
                    multiline
                    maxLength={MAX_CAPTION}
                    autoFocus
                  />
                  <Text style={[styles.charCount, charsLeft < 100 && { color: charsLeft < 20 ? '#FF3D00' : Colors.warning }]}>
                    {charsLeft}
                  </Text>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    minHeight: '70%',
    maxHeight: '95%',
    borderTopWidth: 2,
    borderColor: '#e8e8e8',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#ddd', alignSelf: 'center', marginTop: 8, marginBottom: 4,
  },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1.5, borderBottomColor: '#f0f0f0',
  },
  topBarCancel: { fontSize: 15, fontWeight: '700', color: '#666', minWidth: 60 },
  topBarTitle: { fontSize: 16, fontWeight: '900', color: '#111' },
  postBtn: {
    backgroundColor: Colors.primary, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 8, minWidth: 60,
    alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: '#ccc' },
  postBtnText: { fontSize: 14, fontWeight: '900', color: '#fff' },

  // Pick step
  pickStep: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingHorizontal: 32, paddingVertical: 40,
  },
  pickTitle: { fontSize: 22, fontWeight: '900', color: '#111' },
  pickSub: { fontSize: 14, color: '#888', fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  pickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    width: '100%', paddingVertical: 15, paddingHorizontal: 20,
    borderRadius: 18, overflow: 'hidden', justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  pickBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2, borderColor: Colors.primary,
  },
  pickBtnText: { fontSize: 15, fontWeight: '900', color: '#fff' },

  // Compose step
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: 320 },
  changePhoto: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  changePhotoText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  captionWrap: { padding: 16, gap: 8 },
  captionInput: {
    fontSize: 15, color: '#111', lineHeight: 22,
    fontWeight: '500', minHeight: 80,
  },
  charCount: { fontSize: 12, color: '#bbb', fontWeight: '700', textAlign: 'right' },
});
