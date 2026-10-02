import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../components/chrome';
import { DatePicker } from '../components/DatePicker';
import { ageFrom, MIN_AGE, GENDERS, INTEREST_GROUPS, type Gender } from '@chatlol/shared';
import { register } from '../lib/actions';
import { useColors } from '../lib/theme';
import { Button, Chip, IconButton, Input, Label, Row, Text } from '../components/ui';


export default function Join() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ displayName: '', handle: '', email: '', password: '' });
  const [birthdate, setBirthdate] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [gender, setGender] = useState<Gender | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(birthdate);
  const age = validDob ? ageFrom(birthdate) : null;
  const ok = useMemo(() => f.displayName && /^[a-zA-Z0-9_.]{3,20}$/.test(f.handle) && f.email.includes('@') && f.password.length >= 8 && age !== null && age >= MIN_AGE && !!gender && agree,
    [f, age, agree, gender]);

  async function submit() {
    setBusy(true); setErr('');
    try { await register({ ...f, email: f.email.trim(), birthdate, gender: gender!, interests }); router.replace('/drops'); }
    catch (e) { setErr((e as Error).message); setStep(1); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, padding: 20, gap: 12, paddingBottom: insets.bottom + 30, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <IconButton name="arrow-back" label="Back" onPress={() => (step === 2 ? setStep(1) : router.back())} />
        {step === 1 ? (
          <>
            <BrandMark height={26} />
            <Text variant="headlineXl">Join the vibe 🌅</Text>
            <Input value={f.displayName} onChangeText={set('displayName')} placeholder="Your name" maxLength={40} autoComplete="name" />
            <Input value={f.handle} onChangeText={set('handle')} placeholder="@handle" autoCapitalize="none" maxLength={20} />
            <Input value={f.email} onChangeText={set('email')} placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Input value={f.password} onChangeText={set('password')} placeholder="Password (8+ characters)" secureTextEntry textContentType="newPassword" />
            <Label>Birthday</Label>
            <DatePicker value={birthdate} onChange={setBirthdate} label="Your birthday" placeholder="Pick your birthday 🎂" startView="years" defaultYear={new Date().getFullYear() - 25} max={new Date().toISOString().slice(0, 10)} />
            {age !== null && age < MIN_AGE ? <Text color={c.error}>ChatLOL is for adults {MIN_AGE}+ only.</Text> : null}
            <Label>I am</Label>
            <Row gap={8}>
              {GENDERS.map((g) => (
                <Pressable key={g.key} onPress={() => setGender(g.key)} accessibilityRole="radio" accessibilityState={{ checked: gender === g.key }}
                  style={{ flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: gender === g.key ? c.flame : c.sandstone, backgroundColor: gender === g.key ? c.flame : 'transparent' }}>
                  <Text variant="labelLg" color={gender === g.key ? '#fff' : c.onSurface}>{g.emoji} {g.label}</Text>
                </Pressable>
              ))}
            </Row>
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
            <Text variant="labelMd" color={c.flame}>{interests.length}/20 picked</Text>
            {INTEREST_GROUPS.map((g) => (
              <View key={g.label} style={{ gap: 6 }}>
                <Label>{g.label}</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {g.items.map((i) => <Chip key={i} label={`#${i}`} active={interests.includes(i)} onPress={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : x.length >= 20 ? x : [...x, i]))} />)}
                </View>
              </View>
            ))}
            <Button title="Start vibing (+250 Sparks)" loading={busy} onPress={submit} style={{ marginTop: 12 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
