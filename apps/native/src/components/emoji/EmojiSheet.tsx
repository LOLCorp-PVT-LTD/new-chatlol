import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GiphySticker, StickerCatalog, StickerInput } from '@chatlol/shared';
import { notoAnimatedUrl } from '@chatlol/shared';
import emojiData from 'emoji-picker-element-data/en/emojibase/data.json';
import { api } from '../../lib/api';
import { errorToast, toast } from '../../lib/actions';
import { confirmDialog } from '../../lib/dialog';
import { haptic } from '../../lib/native';
import { useColors } from '../../lib/theme';
import { Chip, Input, Row, Tap, Text } from '../ui';
import { CustomEmoji } from './CustomEmoji';

type EmojiRow = { emoji: string; annotation: string; tags?: string[]; shortcodes?: string[]; group: number; order: number };
const ALL = (emojiData as EmojiRow[]).filter((e) => e.group !== 2).sort((a, b) => a.order - b.order);
const GROUPS: [number, string][] = [[0, '😀'], [1, '👋'], [3, '🐶'], [4, '🍕'], [5, '✈️'], [6, '⚽'], [7, '💡'], [8, '❤️'], [9, '🏳️']];
let cachedCatalog: StickerCatalog | null = null;

/**
 * The emoji & sticker sheet: every standard emoji (search + categories), ChatLOL custom emoji, and animated sticker
 * packs + GIPHY search. Locked packs show their Sparks price and unlock right here.
 */
export function EmojiSheet({ visible, onClose, onInsert, onSticker }: { visible: boolean; onClose: () => void; onInsert: (t: string) => void; onSticker?: (s: StickerInput) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState<'emoji' | 'custom' | 'stickers'>('emoji');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(0);
  const [cat, setCat] = useState<StickerCatalog | null>(cachedCatalog);
  const [giphyQ, setGiphyQ] = useState('');
  const [giphy, setGiphy] = useState<GiphySticker[]>([]);
  const sheetW = Math.min(width, 560);
  const cols = 8;
  const cell = Math.floor((sheetW - 24) / cols);

  const load = async (force = false) => {
    if (cachedCatalog && !force) return setCat(cachedCatalog);
    try { setCat((cachedCatalog = await api.stickers())); } catch (e) { errorToast(e); }
  };
  useEffect(() => { if (visible && tab !== 'emoji') void load(); }, [visible, tab]);
  useEffect(() => {
    if (tab !== 'stickers' || !cat?.giphy.owned) return;
    const t = setTimeout(() => void api.giphySearch(giphyQ.trim()).then((r) => setGiphy(r.results)).catch(errorToast), 350);
    return () => clearTimeout(t);
  }, [giphyQ, tab, cat?.giphy.owned]);

  const emojis = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ALL.filter((e) => e.group === group);
    return ALL.filter((e) => e.annotation.includes(s) || e.tags?.some((t) => t.startsWith(s)) || e.shortcodes?.some((t) => t.includes(s))).slice(0, 160);
  }, [q, group]);
  const owned = new Set(cat?.owned ?? []);

  async function unlock(key: string, name: string, price: number) {
    if (!(await confirmDialog({ title: `Unlock ${name}?`, body: `${price.toLocaleString()} Sparks · yours forever.`, icon: 'lock-open', confirmText: `Unlock for ${price.toLocaleString()} ✦` }))) return;
    try {
      await api.buy(key);
      toast({ kind: 'reward', title: `${name} unlocked ✨` });
      await load(true);
    } catch (e) { errorToast(e); }
  }
  const sticker = (s: StickerInput) => { haptic.tap(); onSticker?.(s); onClose(); };
  const lockBtn = (key: string, name: string, price: number) => (
    <Tap onPress={() => unlock(key, name, price)} style={{ backgroundColor: c.flame, borderRadius: 99, paddingHorizontal: 12, height: 30, justifyContent: 'center' }}><Text variant="labelMd" color="#fff">🔓 {price.toLocaleString()} ✦</Text></Tap>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ height: Math.min(460, height * 0.62) + insets.bottom, paddingBottom: insets.bottom, width: sheetW, alignSelf: 'center', backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.outlineVariant, alignSelf: 'center', marginTop: 8 }} />
          <Row gap={6} style={{ padding: 10 }}>
            {(['emoji', 'custom', ...(onSticker ? ['stickers'] : [])] as const).map((t) => <Chip key={t} label={t === 'emoji' ? '😀 Emoji' : t === 'custom' ? '🔤 ChatLOL' : '✨ Stickers'} active={tab === t} onPress={() => setTab(t as typeof tab)} />)}
          </Row>

          {tab === 'emoji' ? (
            <View style={{ flex: 1 }}>
              <View style={{ paddingHorizontal: 12 }}><Input value={q} onChangeText={setQ} placeholder="Search emoji" style={{ minHeight: 42 }} autoCorrect={false} /></View>
              {!q ? (
                <Row gap={2} style={{ paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'space-between' }}>
                  {GROUPS.map(([g, icon]) => (
                    <Tap key={g} onPress={() => setGroup(g)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: group === g ? c.sunlit : 'transparent' }}><Text style={{ fontSize: 18 }}>{icon}</Text></Tap>
                  ))}
                </Row>
              ) : null}
              <FlatList
                data={emojis}
                key={`${q ? 's' : group}`}
                numColumns={cols}
                keyExtractor={(e) => e.emoji}
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={64}
                renderItem={({ item }) => (
                  <Tap onPress={() => { haptic.tap(); onInsert(item.emoji); }} style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={item.annotation}>
                    <Text style={{ fontSize: Math.round(cell * 0.62), lineHeight: Math.round(cell * 0.8) }}>{item.emoji}</Text>
                  </Tap>
                )}
              />
            </View>
          ) : !cat ? (
            <Text color={c.onSurfaceVariant} style={{ textAlign: 'center', marginTop: 40 }}>Loading…</Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {tab === 'custom'
                ? cat.emojiPacks.map((p) => (
                    <View key={p.key} style={{ gap: 8 }}>
                      <Row style={{ justifyContent: 'space-between' }}><Text variant="labelLg">{p.name}{!p.price ? ' · free' : ''}</Text>{!owned.has(p.key) ? lockBtn(p.key, p.name, p.price) : null}</Row>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, opacity: owned.has(p.key) ? 1 : 0.45 }}>
                        {p.emojis.map((e) => (
                          <Tap key={e.code} disabled={!owned.has(p.key)} onPress={() => { haptic.tap(); onInsert(`:${e.code}:`); }} accessibilityLabel={`:${e.code}:`}><CustomEmoji emoji={e} size={Math.min(52, cell + 6)} /></Tap>
                        ))}
                      </View>
                    </View>
                  ))
                : (
                    <>
                      {cat.stickerPacks.map((p) => (
                        <View key={p.key} style={{ gap: 8 }}>
                          <Row style={{ justifyContent: 'space-between' }}><Text variant="labelLg">{p.name}{!p.price ? ' · free' : ''}</Text>{!owned.has(p.key) ? lockBtn(p.key, p.name, p.price) : null}</Row>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, opacity: owned.has(p.key) ? 1 : 0.45 }}>
                            {p.stickers.map((st) => (
                              <Tap key={st.id} disabled={!owned.has(p.key)} onPress={() => sticker({ kind: 'noto', id: `${p.key}/${st.id}` })} accessibilityLabel={st.label}>
                                <Image source={notoAnimatedUrl(st.cp)} style={{ width: 60, height: 60 }} contentFit="contain" />
                              </Tap>
                            ))}
                          </View>
                        </View>
                      ))}
                      {cat.giphy.available ? (
                        <View style={{ gap: 8 }}>
                          <Row style={{ justifyContent: 'space-between' }}><Text variant="labelLg">GIPHY stickers</Text>{!cat.giphy.owned ? lockBtn(cat.giphy.key, 'GIPHY Sticker Search', cat.giphy.price) : null}</Row>
                          {cat.giphy.owned ? (
                            <>
                              <Input value={giphyQ} onChangeText={setGiphyQ} placeholder="Search GIPHY stickers" style={{ minHeight: 42 }} />
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {giphy.map((g) => (
                                  <Tap key={g.id} onPress={() => sticker({ kind: 'giphy', id: g.id, url: g.url, w: g.w, h: g.h })}><Image source={g.preview} style={{ width: 96, height: 96 }} contentFit="contain" /></Tap>
                                ))}
                              </View>
                              <Text variant="labelSm" color={c.onSurfaceVariant} style={{ textAlign: 'right' }}>Powered by GIPHY</Text>
                            </>
                          ) : <Text variant="bodySm" color={c.onSurfaceVariant}>Search millions of animated stickers.</Text>}
                        </View>
                      ) : null}
                      <Text variant="labelSm" color={c.onSurfaceVariant}>Animated stickers: Noto Animated Emoji by Google (CC BY 4.0)</Text>
                    </>
                  )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The 😊 button next to a text box that opens the sheet. */
export function EmojiButton({ onInsert, onSticker, size = 40 }: { onInsert: (t: string) => void; onSticker?: (s: StickerInput) => void; size?: number }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tap onPress={() => setOpen(true)} accessibilityLabel="Emoji and stickers" style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceContainerLow }}>
        <Text style={{ fontSize: size * 0.5 }}>😊</Text>
      </Tap>
      <EmojiSheet visible={open} onClose={() => setOpen(false)} onInsert={onInsert} onSticker={onSticker} />
    </>
  );
}
