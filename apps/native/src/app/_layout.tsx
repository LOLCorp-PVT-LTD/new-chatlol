import React, { useEffect, useRef } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { boot } from '../lib/actions';
import { session, useSession } from '../lib/store';
import { useColors, useIsDark } from '../lib/theme';
import { desktop } from '../lib/desktop';
import { biometricsAvailable, pushLink, unlockWithBiometrics } from '../lib/native';
import { Toasts } from '../components/Toasts';
import { LevelUpModal } from '../components/LevelUp';
import { LockScreen } from '../components/LockScreen';

void SplashScreen.preventAutoHideAsync();
export const APP_LOCK_KEY = 'chatlol.applock';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);
  const locked = useSession((s) => s.locked);
  const segments = useSegments();
  const c = useColors();
  const dark = useIsDark();
  const bgAt = useRef<number>(0);

  useEffect(() => { void boot(); }, []);
  useEffect(() => { if (fontsLoaded && ready) void SplashScreen.hideAsync(); }, [fontsLoaded, ready]);

  // Auth gate: signed-out users land on the welcome screen.
  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string;
    const inAuth = ['welcome', 'login', 'join', 'forgot', 'reset-password'].includes(first);
    if (first === 'verify') return; // works signed in or out
    if (!user && !inAuth) router.replace('/welcome');
    else if (user && inAuth && first !== 'reset-password') router.replace('/');
  }, [ready, user, segments]);

  // Push taps & desktop deep links route into the app.
  useEffect(() => {
    if (Platform.OS === 'web') return desktop?.onDeepLink((path) => router.push(path as never));
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = pushLink(r.notification);
      if (link) router.push(link as never);
    });
    return () => sub.remove();
  }, []);

  // Optional biometric app lock after 60s in background.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', async (st) => {
      if (st === 'background') bgAt.current = Date.now();
      if (st === 'active' && bgAt.current && Date.now() - bgAt.current > 60_000 && session.get().user) {
        const on = (await SecureStore.getItemAsync(APP_LOCK_KEY)) === '1';
        if (on && (await biometricsAvailable())) {
          session.set({ locked: true });
          if (await unlockWithBiometrics()) session.set({ locked: false });
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Optional "take a break" nudge (Settings → Take-a-break reminder).
  const breakMins = user?.settings.breakReminderMins ?? 0;
  useEffect(() => {
    if (!breakMins) return;
    const t = setTimeout(() => Alert.alert('🌇 Golden hour check-in', `You’ve been vibing for ${breakMins} minutes. Stretch, hydrate — your streak will wait.`), breakMins * 60_000);
    return () => clearTimeout(t);
  }, [breakMins]);

  if (!fontsLoaded || !ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.surface }}>
      <SafeAreaProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface }, animation: 'slide_from_right' }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          </Stack>
          <Toasts />
          <LevelUpModal />
          {locked ? <LockScreen /> : null}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
