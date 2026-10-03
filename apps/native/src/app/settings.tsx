import { themeAllowed } from '@chatlol/shared';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Switch, View } from 'react-native';
import { formDialog } from '../lib/dialog';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import type { UserSettings } from '@chatlol/shared';
import { api } from '../lib/api';
import { logout, errorToast, adoptSession, toast } from '../lib/actions';
import { biometricsAvailable, unlockWithBiometrics } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors, WEB_THUMB } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Button, Card, Chip, Input, Label, Row, Text, Icon, type IconName } from '../components/ui';
import { APP_LOCK_KEY } from './_layout';
import { AppThemePicker } from '../components/AppThemePicker';

type ToggleDef = { k: keyof UserSettings; label: string; hint: string; icon: IconName };
const PRIVACY: ToggleDef[] = [
  { k: 'showOnline', label: 'Show when I’m online', hint: 'Green dot on your avatar', icon: 'radio-button-checked' },
  { k: 'showGender', label: 'Show my gender', hint: 'On your profile and in search', icon: 'wc' },
  { k: 'showCity', label: 'Show my city', hint: 'On your profile', icon: 'location-on' },
  { k: 'showInRoulette', label: 'Appear in Rate & Meet', hint: 'Your photos in the rating deck', icon: 'casino' },
  { k: 'celebrateBirthday', label: 'Celebrate my birthday', hint: 'Birthday post + follower heads-up (never your age)', icon: 'cake' },
  { k: 'ghostMode', label: 'Ghost mode in lounges', hint: 'Read without showing up', icon: 'visibility-off' },
  { k: 'showAIPersonas', label: 'Show AI personas', hint: 'Include ✦ AI personas in search', icon: 'smart-toy' },
];
const NOTIFY: ToggleDef[] = [
  { k: 'pushEnabled', label: 'Push notifications', hint: 'Master switch', icon: 'notifications' },
  { k: 'notifyDms', label: 'Messages', hint: 'New DMs', icon: 'mail' },
  { k: 'notifyMentions', label: 'Mentions & shout replies', hint: '@mentions in shouts', icon: 'alternate-email' },
  { k: 'notifyRatings', label: 'Ratings & profile views', hint: 'Photo and profile ratings', icon: 'star' },
  { k: 'notifyComments', label: 'Comments & wall notes', hint: 'On your posts and wall', icon: 'chat-bubble' },
  { k: 'notifyFollows', label: 'New followers', hint: 'And new friends', icon: 'person-add' },
  { k: 'notifyLive', label: 'Live streams', hint: 'When people you follow go live', icon: 'live-tv' },
  { k: 'notifyArena', label: 'Hot Take results', hint: 'Arena wins and losses', icon: 'sports-kabaddi' },
];
const EXPERIENCE: ToggleDef[] = [
  { k: 'autoplayMusic', label: 'Autoplay profile songs', hint: 'When you open someone’s profile', icon: 'music-note' },
  { k: 'hapticsEnabled', label: 'Haptics', hint: 'Taps, matches and rewards', icon: 'vibration' },
  { k: 'soundEnabled', label: 'Sounds', hint: 'Reward chimes', icon: 'volume-up' },
  { k: 'reduceMotion', label: 'Reduce motion', hint: 'Fewer animations', icon: 'motion-photos-off' },
  { k: 'safeMode', label: 'SafeShield strict mode', hint: 'Hide community-flagged posts', icon: 'shield' },
];

export default function Settings() {
  const c = useColors();
  const user = useSession((s) => s.user);
  const [lock, setLock] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [name, setName] = useState(user?.displayName ?? '');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
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
    try { session.set({ user: (await api.updateMe({ displayName: name, bio })).user }); toast({ kind: 'info', title: 'Saved ✨' }); } catch (e) { errorToast(e); }
  }
  async function changePassword() {
    try {
      const r = await api.changePassword(pwCur, pwNew);
      await adoptSession(r.token);
      setPwCur(''); setPwNew('');
      toast({ kind: 'info', title: 'Password changed — other devices were signed out 🔐' });
    } catch (e) { errorToast(e); }
  }
  async function changeEmail() {
    try {
      session.set({ user: (await api.changeEmail(newEmail.trim(), emailPw)).user });
      setNewEmail(''); setEmailPw('');
      toast({ kind: 'info', title: 'Email updated — check your inbox to verify it 📬' });
    } catch (e) { errorToast(e); }
  }
  const toggleRow = (t: ToggleDef) => (
    <Row key={t.k} gap={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunlit, alignItems: 'center', justifyContent: 'center' }}><Icon name={t.icon} color={c.flame} size={20} /></View>
      <View style={{ flex: 1 }}><Text variant="labelLg">{t.label}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>{t.hint}</Text></View>
      <Switch value={!!user!.settings[t.k]} onValueChange={(v) => set(t.k, v as never)} trackColor={{ true: c.flame, false: c.sandstone }} thumbColor="#fff" {...WEB_THUMB} />
    </Row>
  );
  const choices = <K extends keyof UserSettings>(title: string, k: K, opts: [UserSettings[K], string][]) => (
    <View key={k} style={{ gap: 8 }}><Label>{title}</Label>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>{opts.map(([v, l]) => <Chip key={String(v)} label={l} active={user!.settings[k] === v} onPress={() => set(k, v)} />)}</Row></View>
  );
  function remove() {
    void (async () => {
      const r = await formDialog({ title: 'Delete your account?', body: 'This is permanent: your posts, photos, streak, Sparks and Gems are gone for good. Type DELETE to confirm.', icon: 'delete-forever', danger: true, confirmText: 'Delete forever', fields: [{ key: 'typed', type: 'text', placeholder: 'DELETE', required: true }] });
      if (r?.typed.trim().toUpperCase() !== 'DELETE') return;
      await api.deleteAccount(); await logout(); router.replace('/welcome');
    })();
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
        <Button title="Customize profile, song & background" icon="palette" variant="secondary" onPress={() => router.push('/customize')} />
        <Row gap={8}>
          <Button small style={{ flex: 1 }} title={user.premiumUntil ? '👑 Premium' : 'Get Premium'} variant="secondary" onPress={() => router.push('/premium')} />
          <Button small style={{ flex: 1 }} title="Who viewed me" icon="visibility" variant="secondary" onPress={() => router.push('/insights')} />
        </Row>
        <Card style={{ padding: 16, gap: 14 }}>
          <Text variant="headlineSm">🔒 Privacy</Text>
          {choices('Who can message me', 'dmFrom', [['everyone', 'Everyone'], ['following', 'People I follow'], ['nobody', 'Nobody']])}
          {choices('Who can comment on my posts', 'whoCanComment', [['everyone', 'Everyone'], ['following', 'People I follow']])}
          {choices('Who can post on my wall', 'wallFrom', [['everyone', 'Everyone'], ['following', 'People I follow'], ['nobody', 'Nobody']])}
          {choices('Who can send me friend requests', 'friendRequestsFrom', [['everyone', 'Everyone'], ['friends_of_friends', 'Friends of friends'], ['nobody', 'Nobody']])}
          {choices('Who can see my profile', 'profileVisibility', [['everyone', 'Everyone'], ['members', 'Signed-in members']])}
        </Card>
        <Card style={{ paddingVertical: 6 }}>{PRIVACY.map(toggleRow)}</Card>
        <Text variant="headlineSm" style={{ marginTop: 4 }}>🔔 Notifications</Text>
        <Card style={{ paddingVertical: 6 }}>{NOTIFY.map(toggleRow)}</Card>
        <Text variant="headlineSm" style={{ marginTop: 4 }}>🎨 Experience</Text>
        <Card style={{ paddingVertical: 6 }}>
          {EXPERIENCE.map(toggleRow)}
          {bioAvailable ? (
            <Row gap={12} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunlit, alignItems: 'center', justifyContent: 'center' }}><Icon name="fingerprint" color={c.flame} size={20} /></View>
              <View style={{ flex: 1 }}><Text variant="labelLg">Face ID / Biometric lock</Text><Text variant="bodySm" color={c.onSurfaceVariant}>Require unlock after 1 min away</Text></View>
              <Switch value={lock} onValueChange={toggleLock} trackColor={{ true: c.flame, false: c.sandstone }} thumbColor="#fff" {...WEB_THUMB} />
            </Row>
          ) : null}
        </Card>
        <Card style={{ padding: 16, gap: 14 }}>
          <View style={{ gap: 8 }}><Label>Light or dark</Label>
            <Row gap={8}>{(['light', 'dark', 'system'] as const).map((o) => <Chip key={o} label={o === 'dark' ? '🌙 Dark' : o === 'light' ? '☀️ Light' : '⚙️ System'} active={user.settings.darkMode === o} onPress={() => set('darkMode', o)} />)}</Row></View>
          <View style={{ gap: 8 }}><Label>Colours</Label>
            <AppThemePicker value={user.settings.appTheme ?? { preset: 'sunset', custom: null }} onChange={(t) => set('appTheme', t)} isAllowed={(k) => themeAllowed(k, { premium: !!user.premiumUntil, unlocked: user.unlockedThemes ?? [] })} /></View>
          <View style={{ gap: 8 }}><Label>Take-a-break reminder</Label>
            <Row gap={8}>{[0, 30, 60, 90].map((m) => <Chip key={m} label={m ? `${m} min` : 'Off'} active={user.settings.breakReminderMins === m} onPress={() => set('breakReminderMins', m)} />)}</Row></View>
        </Card>
        <Card style={{ padding: 16, gap: 10 }}>
          <Label>Change email</Label>
          <Input value={newEmail} onChangeText={setNewEmail} placeholder="New email address" keyboardType="email-address" autoCapitalize="none" />
          <Input value={emailPw} onChangeText={setEmailPw} placeholder="Your password (to confirm)" secureTextEntry />
          <Button small title="Change email" variant="secondary" disabled={!newEmail.includes('@') || !emailPw} onPress={changeEmail} />
          <Label>Password</Label>
          <Input value={pwCur} onChangeText={setPwCur} placeholder="Current password" secureTextEntry textContentType="password" />
          <Input value={pwNew} onChangeText={setPwNew} placeholder="New password (8+ characters)" secureTextEntry textContentType="newPassword" />
          <Button small title="Change password" variant="secondary" disabled={!pwCur || pwNew.length < 8} onPress={changePassword} />
        </Card>
        <Card style={{ padding: 16, gap: 8 }}>
          <Text>{user.moderation.status === 'active' ? '✅ Account in good standing' : `⚠️ ${user.moderation.status}${user.moderation.until ? ` until ${new Date(user.moderation.until).toLocaleString()}` : ''} — ${user.moderation.reason ?? ''}`}</Text>
          <Text>Signed in as <Text variant="labelLg">{user.email}</Text> {user.emailVerified ? <Text variant="labelSm" color={c.online}>✓ verified</Text> : null}</Text>
          {!user.emailVerified ? <Button small title="Send verification email" variant="secondary" onPress={() => api.resendVerification().then(() => toast({ kind: 'info', title: `Link sent to ${user.email}` })).catch(errorToast)} /> : null}
          <Button title="Log out" icon="logout" variant="secondary" onPress={async () => { await logout(); router.replace('/welcome'); }} />
          <Button title="Delete account" icon="delete-forever" variant="ghost" onPress={remove} />
        </Card>
      </ScrollView>
    </View>
  );
}
