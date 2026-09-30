import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ageFrom, MIN_AGE } from '@chatlol/shared';
import { register } from '../lib/actions';
import { useColors } from '../lib/theme';
import { Button, Chip, IconButton, Input, Label, Row, Text } from '../components/ui';

const INTERESTS = ['photography', 'music', 'lofi', 'gaming', 'fashion', 'thrifted', 'food', 'fitness', 'travel', 'art', 'tech', 'books', 'skate', 'anime'];

export default function Join() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ displayName: '', handle: '', email: '', password: '' });
  const [dob, setDob] = useState({ y: '', m: '', d: '' });
  const [interests, setInterests] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const birthdate = `${dob.y.padStart(4, '0')}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}`;
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(birthdate) && !Number.isNaN(Date.parse(birthdate)) && dob.y.length === 4;
  const age = validDob ? ageFrom(birthdate) : null;
  const ok = useMemo(() => f.displayName && /^[a-zA-Z0-9_.]{3,20}$/.test(f.handle) && f.email.includes('@') && f.password.length >= 8 && age !== null && age >= MIN_AGE && agree,
    [f, age, agree]);

  async function submit() {
    setBusy(true); setErr('');
    try { await register({ ...f, email: f.email.trim(), birthdate, interests }); router.replace('/drops'); }
    catch (e) { setErr((e as Error).message); setStep(1); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, padding: 20, gap: 12, paddingBottom: insets.bottom + 30, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <IconButton name="arrow-back" label="Back" onPress={() => (step === 2 ? setStep(1) : router.back())} />
        {step === 1 ? (
          <>
            <Text variant="headlineXl">Join the vibe 🌅</Text>
            <Input value={f.displayName} onChangeText={set('displayName')} placeholder="Your name" maxLength={40} autoComplete="name" />
            <Input value={f.handle} onChangeText={set('handle')} placeholder="@handle" autoCapitalize="none" maxLength={20} />
            <Input value={f.email} onChangeText={set('email')} placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Input value={f.password} onChangeText={set('password')} placeholder="Password (8+ characters)" secureTextEntry textContentType="newPassword" />
            <Label>Birthday</Label>
            <Row gap={8}>
              <Input value={dob.m} onChangeText={(m) => setDob({ ...dob, m })} placeholder="MM" keyboardType="number-pad" maxLength={2} style={{ flex: 1, textAlign: 'center' }} />
              <Input value={dob.d} onChangeText={(d) => setDob({ ...dob, d })} placeholder="DD" keyboardType="number-pad" maxLength={2} style={{ flex: 1, textAlign: 'center' }} />
              <Input value={dob.y} onChangeText={(y) => setDob({ ...dob, y })} placeholder="YYYY" keyboardType="number-pad" maxLength={4} style={{ flex: 1.4, textAlign: 'center' }} />
            </Row>
            {age !== null && age < MIN_AGE ? <Text color={c.error}>ChatLOL is for adults {MIN_AGE}+ only.</Text> : null}
            <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.flame, backgroundColor: agree ? c.flame : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {agree ? <Text color="#fff" variant="labelMd">✓</Text> : null}
              </View>
              <Text variant="bodySm" color={c.onSurfaceVariant} style={{ flex: 1 }}>I’m 18+ and agree to the Community Guidelines & Terms. I understand some members are clearly-labeled ✦ AI personas.</Text>
            </Pressable>
            {err ? <Text color={c.error}>{err}</Text> : null}
            <Button title="Next" icon="arrow-forward" disabled={!ok} onPress={() => setStep(2)} />
          </>
        ) : (
          <>
            <Text variant="headlineXl">Pick your vibes</Text>
            <Text color={c.onSurfaceVariant}>We’ll match you with lounges and people who get it.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {INTERESTS.map((i) => <Chip key={i} label={`#${i}`} active={interests.includes(i)} onPress={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />)}
            </View>
            <Button title="Start vibing (+250 Sparks)" loading={busy} onPress={submit} style={{ marginTop: 12 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
