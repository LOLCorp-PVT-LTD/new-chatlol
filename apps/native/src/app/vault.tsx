import React, { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { StoreItem, StoreItemKind } from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, reward, toast } from '../lib/actions';
import { haptic } from '../lib/native';
import { session, useSession } from '../lib/store';
import { useColors, gradients, shadow } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { BANNERS, FRAMES } from '../components/cosmetics';
import { Button, Chip, Gradient, Label, Row, Text } from '../components/ui';

const TABS: [StoreItemKind | 'all', string][] = [['all', '✨ All'], ['frame', '⭕ Frames'], ['flair', '🔥 Flairs'], ['theme', '🎨 Themes'], ['banner', '🏙️ Banners'], ['crate', '🎁 Crates'], ['streak_freeze', '🧊 Boosts']];
const RARITY: Record<string, string> = { common: '#8f7065', rare: '#0284c7', epic: '#7c3aed', legendary: '#ff5e00' };
const previewColors = (i: StoreItem) => FRAMES[i.id] ?? BANNERS[i.id] ?? (gradients.sunset as readonly [string, string]);

export default function Vault() {
  const c = useColors();
  const sparks = useSession((s) => s.user?.sparks ?? 0);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [odds, setOdds] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<StoreItemKind | 'all'>('all');
  const [won, setWon] = useState<StoreItem | null>(null);
  const load = useCallback(async () => { const r = await api.store(); setItems(r.items); setOdds(r.crateOdds); }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const shown = items.filter((i) => tab === 'all' || i.kind === tab || (tab === 'streak_freeze' && i.kind === 'boost'));

  async function buy(i: StoreItem) {
    try {
      const r = await api.buy(i.id);
      session.patchUser({ sparks: r.sparks });
      if (r.won) { setWon(r.won); haptic.heavy(); } else { haptic.success(); toast({ kind: 'reward', title: `${i.emoji} ${i.name} unlocked!` }); }
      void load();
    } catch (e) { errorToast(e); }
  }
  async function equip(i: StoreItem) {
    const r = await api.equip({ [i.kind]: i.equipped ? null : i.id });
    session.set({ user: r.user });
    void load();
  }
  async function chest() {
    const r = await api.claimDaily();
    if (r.claimed) reward(r.reward); else toast({ kind: 'info', title: 'Chest already opened — back tomorrow 🌅' });
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Sparks Vault" />
      <FlatList
        data={shown}
        numColumns={2}
        keyExtractor={(x) => x.id}
        columnWrapperStyle={{ gap: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 60, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            <Gradient colors={gradients.sunset} style={[{ borderRadius: 32, padding: 20 }, shadow.float]}>
              <Label color="rgba(255,255,255,0.8)">Your wallet</Label>
              <Text variant="headlineXl" color="#fff">✦ {sparks.toLocaleString()}</Text>
              <Text color="rgba(255,255,255,0.9)">Earn by dropping daily, matching in Roulette and winning Hot Takes.</Text>
              <Button title="Open Daily Sunset Chest" icon="redeem" variant="white" style={{ marginTop: 12, alignSelf: 'flex-start' }} onPress={chest} />
            </Gradient>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TABS.map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
            </ScrollView>
          </View>
        }
        ListFooterComponent={<Text variant="bodySm" color={c.onSurfaceVariant} style={{ textAlign: 'center', marginTop: 16 }}>Crate odds: {Object.entries(odds).map(([r, p]) => `${r} ${Math.round(p * 100)}%`).join(' · ')}. Duplicates refund 40%. Sparks have no cash value.</Text>}
        renderItem={({ item: i }) => {
          const wearable = ['frame', 'flair', 'theme', 'banner'].includes(i.kind);
          return (
            <View style={[{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: c.surfaceContainerLowest }, shadow.warm]}>
              <Gradient colors={previewColors(i)} style={{ height: 96, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40, lineHeight: 48 }}>{i.emoji}</Text>
                <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 1 }}><Text variant="labelSm" color={RARITY[i.rarity]} style={{ fontSize: 9 }}>{i.rarity.toUpperCase()}</Text></View>
              </Gradient>
              <View style={{ padding: 12, gap: 2, flex: 1 }}>
                <Text variant="labelLg">{i.name}</Text>
                <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={2} style={{ flex: 1 }}>{i.description}</Text>
                {i.owned && wearable
                  ? <Button small title={i.equipped ? 'Equipped ✓' : 'Equip'} variant={i.equipped ? 'secondary' : 'primary'} style={{ marginTop: 8 }} onPress={() => equip(i)} />
                  : <Button small title={`✦ ${i.price.toLocaleString()}`} disabled={sparks < i.price} style={{ marginTop: 8 }} onPress={() => buy(i)} />}
              </View>
            </View>
          );
        }}
      />
      <Modal visible={!!won} transparent animationType="fade" onRequestClose={() => setWon(null)}>
        <Pressable onPress={() => setWon(null)} style={{ flex: 1, backgroundColor: 'rgba(59,46,37,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {won ? (
            <View style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 32, padding: 28, alignItems: 'center', gap: 8, width: '100%', maxWidth: 360 }}>
              <Label>You pulled a</Label>
              <Text variant="headlineLg" color={RARITY[won.rarity]}>{won.rarity.toUpperCase()}</Text>
              <Gradient colors={previewColors(won)} style={{ width: 120, height: 120, borderRadius: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 60, lineHeight: 70 }}>{won.emoji}</Text></Gradient>
              <Text variant="headlineMd">{won.name}</Text>
              <Button title="Nice!" style={{ alignSelf: 'stretch', marginTop: 8 }} onPress={() => setWon(null)} />
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
