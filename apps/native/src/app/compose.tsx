import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, uploadUri } from '../lib/api';
import { reward, refreshMe } from '../lib/actions';
import { pickImage, haptic } from '../lib/native';
import { useColors } from '../lib/theme';
import { Button, Chip, IconButton, Input, Label, Row, Tap, Text } from '../components/ui';

export default function Compose() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; prompt?: string }>();
  const isDrop = params.mode === 'drop';
  const [tab, setTab] = useState<'photo' | 'text' | 'battle'>('photo');
  const [body, setBody] = useState('');
  const [uri, setUri] = useState<string | null>(null);
  const [soundtrack, setSoundtrack] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const can = tab === 'photo' ? !!uri : tab === 'battle' ? !!body.trim() && options.every((o) => o.trim()) : !!body.trim();

  async function pick(src: 'camera' | 'library') {
    const u = await pickImage(src);
    if (u) { setUri(u); haptic.light(); }
  }
  async function submit() {
    setBusy(true); setErr('');
    try {
      const mediaUrl = tab === 'photo' && uri ? await uploadUri(uri) : null;
      const r = isDrop
        ? await api.submitDrop({ body, mediaUrl, soundtrack: soundtrack || null })
        : await api.createPost({ kind: tab, body, mediaUrl, soundtrack: soundtrack || null, battle: tab === 'battle' ? options.map((label) => ({ label })) : undefined });
      reward(r.reward);
      void refreshMe();
      router.back();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.surfaceContainerLowest }}>
      <Row style={{ paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        <IconButton name="close" label="Close" onPress={() => router.back()} />
        <Text variant="headlineMd" style={{ flex: 1 }}>{isDrop ? '🌅 Sunset Drop' : 'New vibe'}</Text>
      </Row>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
        {params.prompt ? <View style={{ backgroundColor: c.sunlit, borderRadius: 24, padding: 16 }}><Label>Today’s prompt</Label><Text variant="headlineSm">“{params.prompt}”</Text></View> : null}
        {!isDrop ? (
          <Row gap={8}>
            <Chip label="Photo" icon="photo-camera" active={tab === 'photo'} onPress={() => setTab('photo')} />
            <Chip label="Text" icon="edit-note" active={tab === 'text'} onPress={() => setTab('text')} />
            <Chip label="This vs That" icon="compare-arrows" active={tab === 'battle'} onPress={() => setTab('battle')} />
          </Row>
        ) : null}
        <Input value={body} onChangeText={setBody} multiline placeholder={tab === 'battle' ? 'Ask the crowd…' : isDrop ? 'Caption your drop…' : 'What’s the vibe? Add #tags'} style={{ minHeight: 100 }} maxLength={1000} />
        {tab === 'photo' ? (
          <>
            {uri ? (
              <View style={{ borderRadius: 24, overflow: 'hidden' }}>
                <Image source={uri} style={{ width: '100%', aspectRatio: 4 / 5 }} contentFit="cover" />
                <View style={{ position: 'absolute', top: 10, right: 10 }}><IconButton name="close" label="Remove photo" bg="rgba(255,248,245,0.85)" onPress={() => setUri(null)} /></View>
              </View>
            ) : (
              <Row gap={10}>
                {Platform.OS !== 'web' ? (
                  <Tap onPress={() => pick('camera')} style={{ flex: 1, aspectRatio: 1, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: c.outlineVariant, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 36, lineHeight: 44 }}>📸</Text><Text variant="labelLg">Camera</Text>
                  </Tap>
                ) : null}
                <Tap onPress={() => pick('library')} style={{ flex: 1, aspectRatio: 1, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: c.outlineVariant, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 36, lineHeight: 44 }}>🖼️</Text><Text variant="labelLg">Library</Text>
                </Tap>
              </Row>
            )}
            <Input value={soundtrack} onChangeText={setSoundtrack} placeholder="🎵 Add a soundtrack (optional)" maxLength={80} />
          </>
        ) : null}
        {tab === 'battle' ? options.map((o, i) => (
          <Input key={i} value={o} onChangeText={(t) => setOptions((x) => x.map((y, j) => (j === i ? t : y)))} placeholder={`Option ${String.fromCharCode(65 + i)}`} maxLength={60} />
        )) : null}
        {tab === 'battle' && options.length < 4 ? <Button small variant="secondary" title="Add option" icon="add" onPress={() => setOptions((x) => [...x, ''])} /> : null}
        {err ? <Text color={c.error}>{err}</Text> : null}
        <Button title={isDrop ? 'Lock In Drop (+120 ✦)' : 'Publish (+20 ✦)'} icon="bolt" disabled={!can} loading={busy} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
