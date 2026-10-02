import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Gender, ProfileSong } from '@chatlol/shared';
import { GENDERS, INTEREST_GROUPS, PROFILE_ACCENTS, PROFILE_BACKGROUNDS } from '@chatlol/shared';
import { api, uploadUri } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { pickImage } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Button, Card, Chip, Gradient, Icon, Input, Label, Row, Tap, Text } from '../components/ui';

/** Profile customizer: background, accent, cover, headline, Spotify song and about-me. */
export default function Customize() {
  const c = useColors();
  const u = useSession((s) => s.user);
  const [bg, setBg] = useState(u?.profile.background ?? { kind: 'preset' as const, value: 'sunset' });
  const [accent, setAccent] = useState(u?.profile.accent ?? '#ff5e00');
  const [coverUrl, setCoverUrl] = useState<string | null>(u?.profile.coverUrl ?? null);
  const [headline, setHeadline] = useState(u?.profile.headline ?? '');
  const [song, setSong] = useState<ProfileSong | null>(u?.profile.song ?? null);
  const [songInput, setSongInput] = useState('');
  const [results, setResults] = useState<ProfileSong[]>([]);
  const [searchOn, setSearchOn] = useState(true);
  const [about, setAbout] = useState({ displayName: u?.displayName ?? '', bio: u?.bio ?? '', pronouns: u?.pronouns ?? '', city: u?.city ?? '' });
  const [gender, setGender] = useState<Gender | null>(u?.gender ?? null);
  const [interests, setInterests] = useState<string[]>(u?.interests ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!songInput.trim() || songInput.includes('spotify')) return setResults([]);
    const t = setTimeout(async () => { const r = await api.spotifySearch(songInput.trim()); setSearchOn(r.enabled); setResults(r.tracks); }, 300);
    return () => clearTimeout(t);
  }, [songInput]);
  if (!u) return null;

  async function upload(target: 'cover' | 'bg') {
    const uri = await pickImage('library');
    if (!uri) return;
    const url = await uploadUri(uri);
    if (target === 'cover') setCoverUrl(url); else setBg({ kind: 'image', value: url });
  }
  async function useLink() { try { setSong((await api.spotifyResolve(songInput.trim())).song); setSongInput(''); } catch (e) { errorToast(e); } }
  async function save() {
    setBusy(true);
    try {
      await api.updateMe({ ...about, interests });
      const r = await api.updateProfile({ background: bg, accent, coverUrl, headline, gender: gender ?? undefined, song: song ? { type: song.type, id: song.id, title: song.title, artist: song.artist, artUrl: song.artUrl } : null });
      session.set({ user: r.user });
      toast({ kind: 'info', title: 'Profile updated ✨' });
      router.back();
    } catch (e) { errorToast(e); } finally { setBusy(false); }
  }
  const swatch = { width: 54, height: 54, borderRadius: 16 };
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Customize profile" right={<Button small title="Save" loading={busy} onPress={save} style={{ marginRight: 8 }} />} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 16, gap: 10 }}>
          <Label>Background</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PROFILE_BACKGROUNDS.map((b) => (
              <Tap key={b.key} onPress={() => setBg({ kind: 'preset', value: b.key })} accessibilityLabel={b.label}>
                <Gradient colors={b.colors as [string, string, ...string[]]} style={[swatch, { borderWidth: 3, borderColor: bg.kind === 'preset' && bg.value === b.key ? c.onSurface : 'transparent' }]} />
              </Tap>
            ))}
            <Tap onPress={() => upload('bg')} style={[swatch, { borderWidth: 2, borderStyle: 'dashed', borderColor: bg.kind === 'image' ? c.flame : c.outlineVariant, alignItems: 'center', justifyContent: 'center' }]}><Icon name="add-photo-alternate" /></Tap>
          </View>
          <Label>Accent colour</Label>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {PROFILE_ACCENTS.map((a) => <Tap key={a} onPress={() => setAccent(a)} accessibilityLabel={`Accent ${a}`} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: a, borderWidth: 3, borderColor: accent === a ? c.onSurface : 'transparent' }} />)}
          </Row>
          <Label>Cover photo</Label>
          {coverUrl ? <Image source={coverUrl} style={{ width: '100%', height: 90, borderRadius: 16 }} contentFit="cover" /> : null}
          <Row gap={8}><Button small variant="secondary" icon="photo-camera" title={coverUrl ? 'Change cover' : 'Upload cover'} onPress={() => upload('cover')} />{coverUrl ? <Button small variant="ghost" title="Remove" onPress={() => setCoverUrl(null)} /> : null}</Row>
          <Label>Headline</Label>
          <Input value={headline} onChangeText={setHeadline} maxLength={80} placeholder="📷 Aspiring photographer & lo-fi beatmaker" />
        </Card>

        <Card style={{ padding: 16, gap: 10 }}>
          <Label>Profile song (Spotify)</Label>
          {song ? (
            <Row gap={10}>
              {song.artUrl ? <Image source={song.artUrl} style={{ width: 48, height: 48, borderRadius: 10 }} /> : <Icon name="music-note" color={c.flame} />}
              <View style={{ flex: 1 }}><Text variant="labelLg" numberOfLines={1}>{song.title || `Spotify ${song.type}`}</Text><Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>{song.artist || 'Plays on your profile'}</Text></View>
              <Button small variant="ghost" title="Remove" onPress={() => setSong(null)} />
            </Row>
          ) : null}
          <Input value={songInput} onChangeText={setSongInput} autoCapitalize="none" placeholder={searchOn ? 'Search Spotify or paste a link' : 'Paste a Spotify link'} />
          {songInput.includes('spotify') ? <Button small title="Use this link" onPress={useLink} /> : null}
          {!searchOn ? <Text variant="bodySm" color={c.onSurfaceVariant}>In Spotify tap Share → Copy Song Link, then paste it here.</Text> : null}
          {results.map((r) => (
            <Tap key={r.id} onPress={() => { setSong(r); setResults([]); setSongInput(''); }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 4 }}>
              {r.artUrl ? <Image source={r.artUrl} style={{ width: 40, height: 40, borderRadius: 8 }} /> : null}
              <View style={{ flex: 1 }}><Text variant="labelLg" numberOfLines={1}>{r.title}</Text><Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>{r.artist}</Text></View>
            </Tap>
          ))}
        </Card>

        <Card style={{ padding: 16, gap: 10 }}>
          <Label>About you</Label>
          <Input value={about.displayName} onChangeText={(v) => setAbout({ ...about, displayName: v })} placeholder="Name" maxLength={40} />
          <Row gap={8}>{GENDERS.map((g) => <Chip key={g.key} label={`${g.emoji} ${g.label}`} active={gender === g.key} onPress={() => setGender(g.key)} />)}</Row>
          <Row gap={8}><Input value={about.pronouns} onChangeText={(v) => setAbout({ ...about, pronouns: v })} placeholder="Pronouns" maxLength={24} style={{ flex: 1 }} /><Input value={about.city} onChangeText={(v) => setAbout({ ...about, city: v })} placeholder="City" maxLength={60} style={{ flex: 1 }} /></Row>
          <Input value={about.bio} onChangeText={(v) => setAbout({ ...about, bio: v })} placeholder="Bio" multiline maxLength={280} style={{ minHeight: 80 }} />
          <Label>Interests • {interests.length}/20</Label>
          {INTEREST_GROUPS.map((g) => (
            <View key={g.label} style={{ gap: 6 }}>
              <Text variant="labelSm" color={c.onSurfaceVariant}>{g.label}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {g.items.map((i) => <Chip key={i} label={`#${i}`} active={interests.includes(i)} onPress={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : x.length >= 20 ? x : [...x, i]))} />)}
              </View>
            </View>
          ))}
        </Card>
        <Button title="Save & apply" icon="save" loading={busy} onPress={save} />
      </ScrollView>
    </View>
  );
}
