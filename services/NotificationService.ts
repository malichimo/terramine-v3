// services/NotificationService.ts
// Handles push notification registration, token storage, and sending
// Uses Expo's push notification service (free, no extra setup needed)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class NotificationService {

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Request permission and return the Expo push token.
   * Returns null if permission is denied or token fetch fails.
   */
  static async registerForPushNotifications(): Promise<string | null> {
    try {
      // Check existing permission
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '7137937a-c2a0-4f44-82fb-66ae790710a1', // EAS project ID
      });

      const token = tokenData.data;
      console.log('Expo push token:', token);

      // Android requires a notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'TerraMine',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFD700',
        });
      }

      return token;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  // ── Send via Expo Push API ────────────────────────────────────────────────

  /**
   * Send a push notification to a specific Expo push token.
   * Called server-side style from the client — safe for low-volume use.
   */
  static async sendPushNotification(
    expoPushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const message = {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data ?? {},
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      if (result.data?.status === 'error') {
        console.warn('Push notification error:', result.data.message);
      }
    } catch (error) {
      // Non-fatal — notification failure should never break the check-in flow
      console.error('Failed to send push notification:', error);
    }
  }

  // ── Check-in notification ─────────────────────────────────────────────────

  /**
   * Notify a property owner that someone checked in to their mine.
   */
  static async sendCheckInNotification(
    ownerPushToken: string,
    visitorNickname: string,
    mineType: string,
    mineName?: string
  ): Promise<void> {
    const mineLabel = mineName || `${mineType.charAt(0).toUpperCase() + mineType.slice(1)} Mine`;
    const mineEmoji = { rock: '🪨', coal: '⚫', gold: '🟡', diamond: '💎' }[mineType] ?? '⛏️';

    await this.sendPushNotification(
      ownerPushToken,
      `${mineEmoji} Mine Visitor!`,
      `${visitorNickname} just checked in to your ${mineLabel}!`,
      { type: 'checkin', mineType }
    );
  }

  // ── Daily reminder ────────────────────────────────────────────────────────

  /**
   * Schedule a daily local notification at 9 AM local time.
   * Cancels any existing daily reminder first to avoid duplicates.
   */
  static async scheduleDailyReminder(): Promise<void> {
    try {
      // Cancel existing daily reminder if any
      await this.cancelDailyReminder();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⛏️ Your mines are waiting!',
          body: 'Log in to collect resources, run daily activities, and check on your properties.',
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 0,
        },
      });

      console.log('Daily reminder scheduled at 9 AM');
    } catch (error) {
      console.error('Failed to schedule daily reminder:', error);
    }
  }

  /**
   * Cancel the daily reminder notification.
   */
  static async cancelDailyReminder(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Failed to cancel daily reminder:', error);
    }
  }
}
