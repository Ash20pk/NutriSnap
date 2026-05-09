/**
 * Push notification helpers.
 *
 * Requires: npx expo install expo-notifications
 * Then add to app.json plugins:
 *   ["expo-notifications", { "icon": "./assets/images/icon.png", "color": "#2F593E" }]
 */

import { Platform } from 'react-native';

// Lazy import so the app doesn't crash if expo-notifications isn't installed yet
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  if (__DEV__) console.warn('[Notifications] expo-notifications not installed. Run: npx expo install expo-notifications');
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('[Notifications] Permission not granted');
    return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (__DEV__) console.log('[Notifications] Push token:', token);
    return token;
  } catch (err) {
    console.error('[Notifications] Failed to get push token:', err);
    return null;
  }
}

export function scheduleLocalNotification(title: string, body: string, delaySeconds = 1) {
  if (!Notifications) return;
  Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
  }).catch((err: any) => {
    if (__DEV__) console.warn('[Notifications] Schedule failed:', err);
  });
}

/** Call after quest XP is claimed. */
export function notifyQuestComplete(questTitle: string, xp: number) {
  scheduleLocalNotification(
    '🏆 Quest Complete!',
    `You finished "${questTitle}" and earned ${xp} XP!`
  );
}

/** Call after check-badges returns newly_earned badges. */
export function notifyBadgesEarned(badges: { title?: string }[]) {
  if (badges.length === 0) return;
  const names = badges.map((b) => b.title || 'Badge').join(', ');
  scheduleLocalNotification(
    '🎖️ New Badge' + (badges.length > 1 ? 's' : '') + ' Earned!',
    badges.length === 1 ? `You earned the "${names}" badge!` : `New badges: ${names}`
  );
}

/** Call from the streak stats check when streak is at risk (last_active = yesterday, not yet logged today). */
export function notifyStreakAtRisk(currentStreak: number) {
  if (currentStreak < 2) return;
  scheduleLocalNotification(
    '🔥 Streak at Risk!',
    `Log a meal today to keep your ${currentStreak}-day streak alive!`
  );
}
