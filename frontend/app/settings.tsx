import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  right,
  destructive = false,
  showDivider = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
  showDivider?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress && !right}
      >
        <View style={[styles.rowIcon, { backgroundColor: destructive ? '#FF3D0015' : theme.primary + '15' }]}>
          <Ionicons name={icon} size={18} color={destructive ? '#FF3D00' : theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: destructive ? '#FF3D00' : theme.text }]}>{label}</Text>
          {sublabel ? <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{sublabel}</Text> : null}
        </View>
        {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={theme.textLight} /> : null)}
      </TouchableOpacity>
      {showDivider && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
    </>
  );
}

export default function SettingsScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Placeholder toggles — wire to real preferences as needed
  const [pushEnabled, setPushEnabled] = useState(true);
  const [activityEnabled, setActivityEnabled] = useState(true);
  const [privateAccount, setPrivateAccount] = useState(false);

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

        {/* Notifications */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
          <SettingsRow
            icon="notifications-outline"
            label="Push Notifications"
            sublabel="Reminders and activity alerts"
            right={
              <Switch
                value={pushEnabled}
                onValueChange={v => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setPushEnabled(v); }}
                trackColor={{ false: '#ddd', true: Colors.primary + '60' }}
                thumbColor={pushEnabled ? Colors.primary : '#aaa'}
              />
            }
          />
          <SettingsRow
            icon="flame-outline"
            label="Activity Updates"
            sublabel="Hypes, comments, follows"
            showDivider={false}
            right={
              <Switch
                value={activityEnabled}
                onValueChange={v => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setActivityEnabled(v); }}
                trackColor={{ false: '#ddd', true: Colors.primary + '60' }}
                thumbColor={activityEnabled ? Colors.primary : '#aaa'}
              />
            }
          />
        </View>

        {/* Privacy */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>PRIVACY</Text>
        <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
          <SettingsRow
            icon="lock-closed-outline"
            label="Private Account"
            sublabel="Only approved followers see your posts"
            right={
              <Switch
                value={privateAccount}
                onValueChange={v => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setPrivateAccount(v); }}
                trackColor={{ false: '#ddd', true: Colors.primary + '60' }}
                thumbColor={privateAccount ? Colors.primary : '#aaa'}
              />
            }
          />
          <SettingsRow
            icon="document-text-outline"
            label="Privacy Policy"
            showDivider={false}
            onPress={() => router.push('/privacy-policy' as any)}
          />
        </View>

        {/* Account */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
          <SettingsRow
            icon="person-outline"
            label="Edit Profile"
            onPress={() => router.push('/edit-profile' as any)}
          />
          <SettingsRow
            icon="gift-outline"
            label="Redeem Code"
            showDivider={false}
            onPress={() => router.push('/redeem' as any)}
          />
        </View>

        {/* About */}
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>ABOUT</Text>
        <View style={[styles.card, { backgroundColor: theme.white, borderColor: theme.border }]}>
          <SettingsRow
            icon="information-circle-outline"
            label="App Version"
            sublabel="1.0.0"
            showDivider={false}
          />
        </View>

      </ScrollView>
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
  headerTitle: { fontSize: 18, fontWeight: '900' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  card: {
    marginHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 5,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  divider: { height: 1, marginLeft: 66 },
});
