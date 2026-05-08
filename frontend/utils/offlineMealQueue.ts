/**
 * Offline queue for meal logs.
 *
 * When a meal log fails due to a network error the payload is saved to
 * AsyncStorage. Call flushOfflineMealQueue() when the app returns to the
 * foreground or when a meal logs successfully (indicating connectivity is
 * back) to retry queued meals.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MealLogData, Meal } from './api';

const QUEUE_KEY = 'offline_meal_queue';

interface QueuedMeal {
  id: string;
  payload: MealLogData;
  queuedAt: string;
}

export async function enqueueOfflineMeal(payload: MealLogData): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedMeal[] = raw ? JSON.parse(raw) : [];
    queue.push({
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      payload,
      queuedAt: new Date().toISOString(),
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    if (__DEV__) console.log(`[OfflineQueue] Queued meal, total queued: ${queue.length}`);
  } catch (err) {
    console.error('[OfflineQueue] Failed to enqueue meal:', err);
  }
}

export async function getOfflineQueueLength(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedMeal[] = raw ? JSON.parse(raw) : [];
    return queue.length;
  } catch {
    return 0;
  }
}

/**
 * Attempt to flush all queued meals. Returns the number successfully sent.
 * logFn should be mealApi.logMeal (passed in to avoid circular imports).
 */
export async function flushOfflineMealQueue(
  logFn: (payload: MealLogData) => Promise<Meal>
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: QueuedMeal[] = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return 0;

    if (__DEV__) console.log(`[OfflineQueue] Flushing ${queue.length} queued meals`);

    const remaining: QueuedMeal[] = [];
    let sent = 0;

    for (const item of queue) {
      try {
        await logFn(item.payload);
        sent++;
        if (__DEV__) console.log(`[OfflineQueue] Sent queued meal ${item.id}`);
      } catch (err) {
        // Keep it in the queue if it still fails
        remaining.push(item);
        if (__DEV__) console.log(`[OfflineQueue] Still failing, keeping ${item.id}`);
      }
    }

    if (remaining.length > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY);
    }

    return sent;
  } catch (err) {
    console.error('[OfflineQueue] Flush error:', err);
    return 0;
  }
}
