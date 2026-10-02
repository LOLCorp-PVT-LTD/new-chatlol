import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { UserPublic } from '@chatlol/shared';
import { tierByKey, toTen, INTERESTS, GENDERS, type Gender } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast } from '../lib/actions';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Avatar, UserName } from '../components/people';
import { Button, Card, Chip, IconButton, Input, Row, Tap, Text } from '../components/ui';

export default function Members() {
  const c = useColors();
  const [q, setQ] = useState('');
  const [interest, setInterest] = useState<string | undefined>();
  const [online, setOnline] = useState(false);
  const [gender, setGender] = useState<Gender | undefined>();
  const [users, setUsers] = useState<UserPublic[]>([]);
  useEffect(() => {
    const t = setTimeout(() => { void api.members({ q: q || undefined, interest, gender, online: online ? 1 : undefined }).then((r) => setUsers(r.items)); }, 250);
    return () => clearTimeout(t);
  }, [q, interest, online, gender]);
  async function follow(u: UserPublic) {
    const r = await api.follow(u.id);
    setUsers((x) => x.map((y) => (y.id === u.id ? { ...y, isFollowing: r.following } : y)));
  }
  async function dm(u: UserPublic) {
    try { router.push(`/messages/${(await api.openConversation(u.id)).conversation.id}`); } catch (e) { errorToast(e); }
  }
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Browse Members" />
      <FlatList data={users} keyExtractor={(u) => u.id} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Input value={q} onChangeText={setQ} placeholder="🔍  Name, @handle or city" autoCapitalize="none" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label="🟢 Online now" active={online} onPress={() => setOnline(!online)} />
              {GENDERS.map((g) => <Chip key={g.key} label={`${g.emoji} ${g.label}`} active={gender === g.key} onPress={() => setGender(gender === g.key ? undefined : g.key)} />)}
              {INTERESTS.map((i) => <Chip key={i} label={`#${i}`} active={interest === i} onPress={() => setInterest(interest === i ? undefined : i)} />)}
            </ScrollView>
          </View>
        }
        renderItem={({ item: u }) => (
          <Card style={{ padding: 14 }}>
            <Row gap={12}>
              <Tap onPress={() => router.push(`/u/${u.handle}`)}><Avatar user={u} size={56} /></Tap>
              <View style={{ flex: 1, gap: 2 }}>
                <UserName user={u} />
                <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={1}>@{u.handle}{u.city ? ` • ${u.city}` : ''}</Text>
                <Text variant="labelSm" color={c.flame}>{tierByKey(u.vibeTier).emoji} {u.ratingsReceived ? toTen(u.vibeAvg) : '–'} • Lv {u.level}{u.streakDays ? ` • 🔥 ${u.streakDays}` : ''}</Text>
              </View>
              <Button small title={u.isFollowing ? 'Following' : 'Follow'} variant={u.isFollowing ? 'secondary' : 'primary'} onPress={() => follow(u)} />
              <IconButton name="chat" label="Message" bg={c.sunlit} color={c.flame} size={38} onPress={() => dm(u)} />
            </Row>
          </Card>
        )} />
    </View>
  );
}
