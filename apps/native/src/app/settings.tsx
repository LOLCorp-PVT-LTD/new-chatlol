import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type { UserSettings } from '@chatlol/shared';
import { api } from '../lib/api';
import { logout, errorToast } from '../lib/actions';
import { biometricsAvailable, unlockWithBiometrics } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Button, Card, Chip, Input, Label, Row, Text, Icon, type IconName } from '../components/ui';
import { APP_LOCK_KEY } from './_layout';

const TOGGLES: { k: keyof UserSettings; label: string; hint: string; icon: IconName }[] = [
  { k: 'pushEnabled', label: 'Push notifications', hint: 'Ratings, DMs, gifts, invites', icon: 'notifications' },
  { k: 'showOnline', label: 'Show when I’m online', hint: 'Green dot on your avatar', icon: 'radio-button-checked' },
  { k: 'safeMode', label: 'SafeShield strict mode', hint: 'Hide community-flagged posts', icon: 'shield' },
  { k: 'showAIPersonas', label: 'Show AI personas', hint: '✦ labeled AI members', icon: 'smart-toy' },
  { k: 'hapticsEnabled', label: 'Haptics', hint: 'Taps, matches and rewards', icon: 'vibration' },
  { k: 'soundEnabled', label: 'Sounds', hint: 'Reward chimes', icon: 'volume-up' },
];

export default function Settings() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [lock, setLock] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [name, setName] = useState(user?.displayName ?? '');
  const [bioAvailable, setBioAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SecureStore.getItemAsync(APP_LOCK_KEY).then((v) => setLock(v === '1'));
    void biometricsAvailable().then(setBioAvailable);
  }, []);
  if (!user) return null;

  async function set<K extends keyof UserSettings>(k: K, v: UserSettings[K]) {
    session.set({ user: { ...user!, settings: { ...user!.settings, [k]: v } } });
    try { session.set({ user: (await api.updateSettings({ [k]: v })).user }); } catch (e) { errorToast(e); }
  }
  async function toggleLock(on: boolean) {
    if (on && !(await unlockWithBiometrics())) return;
    await SecureStore.setItemAsync(APP_LOCK_KEY, on ? '1' : '0');
    setLock(on);
  }
  async function saveProfile() {
    try { session.set({ user: (await api.updateMe({ displayName: name, bio })).user }); Alert.alert('Saved ✨'); } catch (e) { errorToast(e); }
  }
  function remove() {
    Alert.alert('Delete account?', 'Your posts, streak and Sparks will be gone forever.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteAccount(); await logout(); router.replace('/welcome'); } },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        <Card style={{ padding: 16, gap: 10 }}>
          <Label>Profile</Label>
          <Input value={name} onChangeText={setName} placeholder="Name" maxLength={40} />
          <Input value={bio} onChangeText={setBio} placeholder="Bio" multiline maxLength={280} style={{ minHeight: 90 }} />
          <Button small title="Save profile" onPress={saveProfile} />
        </Card>
        <Card style={{ paddingVertical: 6 }}>
          {TOGGLES.map((t) => (
            <Row key={t.k} gap={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunlit, alignItems: 'center', justifyContent: 'center' }}><Icon name={t.icon} color={c.flame} size={20} /></View>
              <View style={{ flex: 1 }}><Text variant="labelLg">{t.label}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>{t.hint}</Text></View>
              <Switch value={!!user.settings[t.k]} onValueChange={(v) => set(t.k, v as never)} trackColor={{ true: c.flame, false: c.sandstone }} thumbColor="#fff" />
            </Row>
          ))}
          {bioAvailable ? (
            <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunlit, alignItems: 'center', justifyContent: 'center' }}><Icon name="fingerprint" color={c.flame} size={20} /></View>
              <View style={{ flex: 1 }}><Text variant="labelLg">Face ID / Biometric lock</Text><Text variant="bodySm" color={c.onSurfaceVariant}>Require unlock after 1 min away</Text></View>
              <Switch value={lock} onValueChange={toggleLock} trackColor={{ true: c.flame, false: c.sandstone }} thumbColor="#fff" />
            </Row>
          ) : null}
        </Card>
        <Card style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 8 }}><Label>Who can DM me</Label>
            <Row gap={8}>{(['everyone', 'following', 'nobody'] as const).map((o) => <Chip key={o} label={o === 'following' ? 'Followers' : o[0].toUpperCase() + o.slice(1)} active={user.settings.dmFrom === o} onPress={() => set('dmFrom', o)} />)}</Row></View>
          <View style={{ gap: 8 }}><Label>Appearance</Label>
            <Row gap={8}>{(['system', 'light', 'dark'] as const).map((o) => <Chip key={o} label={o === 'dark' ? '🌙 Midnight' : o === 'light' ? '☀️ Sunset' : '⚙️ System'} active={user.settings.darkMode === o} onPress={() => set('darkMode', o)} />)}</Row></View>
          <View style={{ gap: 8 }}><Label>Take-a-break reminder</Label>
            <Row gap={8}>{[0, 30, 60, 90].map((m) => <Chip key={m} label={m ? `${m} min` : 'Off'} active={user.settings.breakReminderMins === m} onPress={() => set('breakReminderMins', m)} />)}</Row></View>
        </Card>
        <Card style={{ padding: 16, gap: 8 }}>
          <Text>Signed in as <Text variant="labelLg">{user.email}</Text></Text>
          <Button title="Log out" icon="logout" variant="secondary" onPress={async () => { await logout(); router.replace('/welcome'); }} />
          <Button title="Delete account" icon="delete-forever" variant="ghost" onPress={remove} />
        </Card>
      </ScrollView>
    </View>
  );
}
