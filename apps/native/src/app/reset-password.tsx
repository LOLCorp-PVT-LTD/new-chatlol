import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { adoptSession, toast } from '../lib/actions';
import { useColors } from '../lib/theme';
import { Button, Input, Text } from '../components/ui';

/** Opened from the email link (universal link https://chatlol.app/reset-password?token=…). */
export default function ResetPassword() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    if (pw !== pw2) return setErr('Passwords don’t match');
    setBusy(true); setErr('');
    try {
      const r = await api.resetPassword(String(token ?? ''), pw);
      await adoptSession(r.token);
      toast({ kind: 'info', title: 'Password updated — other devices were signed out 🔐' });
      router.replace('/');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <ScrollView style={{ backgroundColor: c.surface }} contentContainerStyle={{ paddingTop: insets.top + 24, padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <Text variant="headlineXl">Choose a new password</Text>
      <Input value={pw} onChangeText={setPw} placeholder="New password (8+ characters)" secureTextEntry textContentType="newPassword" />
      <Input value={pw2} onChangeText={setPw2} placeholder="Repeat it" secureTextEntry textContentType="newPassword" onSubmitEditing={submit} />
      {err ? <Text color={c.error}>{err}</Text> : null}
      <Button title="Save & sign in" loading={busy} disabled={pw.length < 8} onPress={submit} />
      <Button title="Need a new link?" variant="ghost" onPress={() => router.replace('/forgot')} />
    </ScrollView>
  );
}
