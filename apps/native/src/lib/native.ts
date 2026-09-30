import { Platform, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { api } from './api';
import { session } from './store';
import { desktop } from './desktop';

const hapticsOn = () => session.get().user?.settings.hapticsEnabled !== false && Platform.OS !== 'web';

export const haptic = {
  tap: () => { if (hapticsOn()) void Haptics.selectionAsync(); },
  light: () => { if (hapticsOn()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); },
  heavy: () => { if (hapticsOn()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); },
  success: () => { if (hapticsOn()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
  error: () => { if (hapticsOn()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); },
};

/** Opens the camera (Sunset Drops) or photo library. Returns a local URI or null. */
export async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera' && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [4, 5] });
    return r.canceled ? null : r.assets[0]?.uri ?? null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [4, 5] });
  return r.canceled ? null : r.assets[0]?.uri ?? null;
}

export async function shareLink(path: string, message?: string) {
  const url = `https://chatlol.app${path}`;
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) return nav.share({ url, text: message }).catch(() => {});
    await Clipboard.setStringAsync(url);
    return;
  }
  await Share.share({ message: message ? `${message} ${url}` : url, url });
}

// ——— Push notifications (APNs / FCM via Expo push) ———
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

export async function registerForPush() {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Vibes', importance: Notifications.AndroidImportance.HIGH, lightColor: '#ff5e00', vibrationPattern: [0, 120, 60, 120] });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId || Constants.easConfig?.projectId;
  try {
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api.registerPushToken({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  } catch (e) {
    console.warn('push registration failed', e);
  }
}

/** Shows an OS-level notification for socket events while the app is backgrounded / on desktop. */
export function localNotify(title: string, body: string, link?: string | null) {
  if (desktop) return desktop.notify(title, body, link);
  if (Platform.OS === 'web') return;
  void Notifications.scheduleNotificationAsync({ content: { title, body, data: { link } }, trigger: null });
}

export function setBadge(n: number) {
  if (desktop) return desktop.setBadge(n);
  if (Platform.OS !== 'web') void Notifications.setBadgeCountAsync(n).catch(() => {});
}

// ——— Biometric app lock ———
export async function biometricsAvailable() {
  if (Platform.OS === 'web') return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}
export async function unlockWithBiometrics() {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock ChatLOL', fallbackLabel: 'Use passcode' });
  return r.success;
}
