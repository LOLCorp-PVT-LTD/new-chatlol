import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { compact } from '@chatlol/shared';
import { session, useSession } from '../lib/store';
import { api } from '../lib/api';
import { haptic } from '../lib/native';
import { gradients, shadow, useColors, useIsDark } from '../lib/theme';
import { Avatar } from './people';
import { actionSheet } from '../lib/dialog';
import { isStaff } from '@chatlol/shared';
import { logout } from '../lib/actions';
import { Gradient, Icon, IconButton, Row, Tap, Text, type IconName } from './ui';

const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Frosted surface: real Liquid Glass on iOS 26+, blur elsewhere. */
export function Frost({ style, children, radius = 999 }: { style?: object; children: React.ReactNode; radius?: number }) {
  const dark = useIsDark();
  const c = useColors();
  if (glass) return <GlassView style={[{ borderRadius: radius, overflow: 'hidden' }, style]} glassEffectStyle="regular">{children}</GlassView>;
  if (Platform.OS === 'web') return <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: dark ? 'rgba(26,17,12,0.8)' : 'rgba(255,248,245,0.82)', backdropFilter: 'blur(20px)' } as object, style]}>{children}</View>;
  return <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: dark ? 'rgba(26,17,12,0.5)' : c.surface + 'aa' }, style]}>{children}</BlurView>;
}

/** CHATLOL wordmark, or just the mascot where space is tight. */
export function BrandMark({ compact, height = 24 }: { compact?: boolean; height?: number }) {
  return compact
    ? <Image source={require('../../assets/brand/mascot.png')} style={{ width: height * 1.45 * (512 / 493), height: height * 1.45 }} contentFit="contain" accessibilityLabel="ChatLOL" />
    : <Image source={require('../../assets/brand/wordmark.png')} style={{ width: height * (800 / 136), height }} contentFit="contain" accessibilityLabel="ChatLOL" />;
}

export function TopBar() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const unread = useSession((s) => s.unread);
  const dms = useSession((s) => s.unreadDms);
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.surface }}>
      <Row style={{ height: 56, paddingHorizontal: 16 }} gap={6}>
        <Tap onPress={() => router.push('/')} accessibilityRole="link" accessibilityLabel="ChatLOL home">
          <BrandMark compact={width < 380} />
        </Tap>
        <View style={{ flex: 1 }} />
        <ThemeSwitch />
        {user ? (
          <>
            <Tap onPress={() => router.push('/vault')} style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceContainer, borderRadius: 99, paddingHorizontal: 12, height: 36 }, shadow.warm]}>
              <Icon name="local-fire-department" size={18} color={c.flame} /><Text variant="labelMd">{compact(user.sparks)}</Text>
            </Tap>
            <IconButton name="mail-outline" label="Messages" badge={dms} onPress={() => router.push('/messages')} />
            <IconButton name="notifications-none" label="Notifications" badge={unread} onPress={() => router.push('/notifications')} />
            <Tap onPress={() => void actionSheet(`@${user.handle}`, [
              { label: 'My profile', icon: 'person', onPress: () => router.push('/locker') },
              { label: 'Friends', icon: 'diversity-3', onPress: () => router.push('/friends') },
              { label: 'Edit my page', icon: 'dashboard-customize', onPress: () => router.push('/page-builder') },
              { label: 'Sparks Vault', icon: 'local-fire-department', onPress: () => router.push('/vault') },
              { label: 'Premium', icon: 'workspace-premium', onPress: () => router.push('/premium') },
              { label: 'Settings', icon: 'settings', onPress: () => router.push('/settings') },
              ...(isStaff(user) ? [{ label: 'Admin panel', icon: 'admin-panel-settings' as const, onPress: () => void Linking.openURL('https://chatlol.app/admin') }] : []),
              { label: 'Log out', icon: 'logout', danger: true, onPress: () => void logout() },
            ])} accessibilityLabel="Account menu: profile, friends, settings"><Avatar user={user} size={34} showOnline={false} /></Tap>
          </>
        ) : null}
      </Row>
    </View>
  );
}

const TAB_ICONS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Home' },
  feed: { icon: 'dynamic-feed', label: 'Feed' },
  shouts: { icon: 'campaign', label: 'Shouts' },
  roulette: { icon: 'casino', label: 'Rate' },
  lounges: { icon: 'forum', label: 'Lounges' },
};

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}

/** The "liquid glass toolbar" from the design: floating pill with a raised centre Drop button. */
export function GlassTabBar({ state, navigation }: TabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12), alignItems: 'center' }}>
      <Frost style={[{ height: 66, width: '100%', maxWidth: 520, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.5)' }, shadow.float]}>
        <Row gap={0} style={{ height: '100%', paddingHorizontal: 6 }}>
          {state.routes.map((r, i) => {
            const meta = TAB_ICONS[r.name];
            if (!meta) return null;
            const focused = state.index === i;
            const onPress = () => {
              haptic.tap();
              const e = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(r.name);
            };
            if (r.name === 'shouts') {
              return (
                <Pressable key={r.key} onPress={onPress} accessibilityRole="tab" accessibilityLabel={meta.label} style={{ flex: 1, alignItems: 'center' }}>
                  <Gradient colors={gradients.sunset} style={[{ width: 58, height: 58, borderRadius: 29, marginTop: -28, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: c.surface }, shadow.float]}>
                    <Icon name={meta.icon} color="#fff" size={26} />
                  </Gradient>
                </Pressable>
              );
            }
            return (
              <Pressable key={r.key} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={meta.label} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 3, borderRadius: 99, backgroundColor: focused ? 'rgba(255,94,0,0.15)' : 'transparent' }}>
                  <Icon name={meta.icon} color={focused ? c.flame : c.onSurfaceVariant} />
                </View>
                <Text variant="labelSm" color={focused ? c.flame : c.onSurfaceVariant} style={{ fontSize: 10 }}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </Row>
      </Frost>
    </View>
  );
}

/** Cycles Light → Dark → System and saves it to the account. */
export function ThemeSwitch() {
  const user = useSession((s) => s.user);
  const local = useSession((s) => s.themeOverride);
  const mode = user?.settings.darkMode ?? local ?? 'system';
  const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
  const icon: IconName = mode === 'light' ? 'light-mode' : mode === 'dark' ? 'dark-mode' : 'contrast';
  return (
    <IconButton
      name={icon}
      label={`Theme: ${mode}. Switch theme`}
      onPress={async () => {
        haptic.tap();
        if (!user) return session.set({ themeOverride: next });
        session.set({ user: { ...user, settings: { ...user.settings, darkMode: next } } });
        try { session.set({ user: (await api.updateSettings({ darkMode: next })).user }); } catch { /* keep local */ }
      }}
    />
  );
}

/** Standard header for pushed screens. */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.surface }}>
      <Row style={{ height: 56, paddingHorizontal: 8 }} gap={4}>
        <IconButton name="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text variant="headlineMd" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
        {right}
      </Row>
    </View>
  );
}
