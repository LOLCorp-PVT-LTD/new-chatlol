import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useColors } from '../lib/theme';
import { Button, IconButton, Input, Text } from '../components/ui';

export default function Forgot() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true); setErr('');
    try { await api.forgotPassword(email.trim()); setSent(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <ScrollView style={{ backgroundColor: c.surface }} contentContainerStyle={{ paddingTop: insets.top + 8, padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <IconButton name="arrow-back" label="Back" onPress={() => router.back()} />
      {sent ? (
        <>
          <Text style={{ fontSize: 56, lineHeight: 64 }}>📬</Text>
          <Text variant="headlineXl">Check your inbox</Text>
          <Text color={c.onSurfaceVariant}>If an account exists for {email}, a reset link is on its way. It expires in 1 hour.</Text>
          <Button title="Back to log in" variant="secondary" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <Text variant="headlineXl">Forgot your password?</Text>
          <Text color={c.onSurfaceVariant}>Enter your email and we’ll send a reset link.</Text>
          <Input value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={submit} />
          {err ? <Text color={c.error}>{err}</Text> : null}
          <Button title="Send reset link" loading={busy} disabled={!email.includes('@')} onPress={submit} />
        </>
      )}
    </ScrollView>
  );
}
