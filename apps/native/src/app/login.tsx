import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { login } from '../lib/actions';
import { useColors } from '../lib/theme';
import { Button, IconButton, Input, Text } from '../components/ui';

export default function Login() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(l = id, p = pw) {
    setBusy(true); setErr('');
    try { await login(l.trim(), p); router.replace('/'); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, padding: 20, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <IconButton name="arrow-back" label="Back" onPress={() => router.back()} />
        <Image source={require('../../assets/brand/mascot.png')} style={{ width: 96, height: 92, alignSelf: 'center' }} contentFit="contain" accessibilityLabel="ChatLOL" />
        <Text variant="headlineXl">Welcome back ✨</Text>
        <Text color={c.onSurfaceVariant}>Your streak and today’s Sunset Drop are waiting.</Text>
        <Input value={id} onChangeText={setId} placeholder="Email or @handle" autoCapitalize="none" autoComplete="username" textContentType="username" />
        <Input value={pw} onChangeText={setPw} placeholder="Password" secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={() => submit()} />
        <View style={{ alignItems: 'flex-end', marginTop: -6 }}><Button small title="Forgot password?" variant="ghost" onPress={() => router.push('/forgot')} /></View>
        {err ? <Text color={c.error}>{err}</Text> : null}
        <Button title="Log in" onPress={() => submit()} loading={busy} />
        <Button title="Try the demo account" variant="secondary" onPress={() => { setId('demo@chatlol.app'); setPw('sunset123'); void submit('demo@chatlol.app', 'sunset123'); }} />
        <View style={{ alignItems: 'center' }}><Button title="New here? Create an account" variant="ghost" onPress={() => router.replace('/join')} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
