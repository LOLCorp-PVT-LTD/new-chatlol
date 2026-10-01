import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { refreshMe } from '../lib/actions';
import { useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { Button, Text } from '../components/ui';

/** Opened from the verification email (universal link https://chatlol.app/verify?token=…). */
export default function Verify() {
  const c = useColors();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const authed = useSession((s) => !!s.user);
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [err, setErr] = useState('');
  useEffect(() => {
    api.verifyEmail(String(token ?? ''))
      .then(async () => { setState('done'); if (authed) await refreshMe(); })
      .catch((e) => { setState('error'); setErr((e as Error).message); });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 64, lineHeight: 74 }}>{state === 'working' ? '✉️' : state === 'done' ? '✅' : '😕'}</Text>
      <Text variant="headlineLg" style={{ textAlign: 'center' }}>{state === 'working' ? 'Verifying…' : state === 'done' ? 'Email verified!' : 'Link didn’t work'}</Text>
      <Text color={c.onSurfaceVariant} style={{ textAlign: 'center' }}>{state === 'done' ? '+50 Sparks are in your wallet. You can now go live and buy Gems.' : err}</Text>
      {state !== 'working' ? <Button title={authed ? 'Back to the vibe' : 'Log in'} onPress={() => router.replace(authed ? '/' : '/login')} /> : null}
    </View>
  );
}
