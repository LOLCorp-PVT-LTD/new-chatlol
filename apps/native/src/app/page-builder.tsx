import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { confirmDialog } from '../lib/dialog';
import { router, useNavigation } from 'expo-router';
import ReorderableList, { reorderItems, useIsActive, useReorderableDrag, type ReorderableListReorderEvent } from 'react-native-reorderable-list';
import type { ProfileLayout, ProfileSection, SectionType } from '@chatlol/shared';
import {
  CORNER_STYLES, CURRENTLY_LABELS, HEADER_STYLES, LAYOUT_PRESETS, MAX_PROFILE_SECTIONS, PAGE_WIDTHS, PROFILE_FONTS, PROFILE_SECTIONS,
  SECTION_GAPS, SECTION_SIZES, SECTION_STYLES, makeSection, parseYouTube, sectionDef,
} from '@chatlol/shared';
import { api } from '../lib/api';
import { errorToast, toast } from '../lib/actions';
import { haptic } from '../lib/native';
import { session } from '../lib/store';
import { useColors } from '../lib/theme';
import { ScreenHeader } from '../components/chrome';
import { Button, Chip, Icon, IconButton, Input, Label, Row, Tap, Text } from '../components/ui';
import { ProfileBackdrop, ProfileHeader } from '../components/Profile';
import { SectionGrid } from '../components/profile/Sections';
import { useProfileData } from '../components/profile/useProfileData';

type Tab = 'sections' | 'add' | 'page' | 'preview';
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * The profile page builder on phones, tablets and desktop: long-press a section's handle and drag to reorder,
 * tap it for its settings, add sections from the catalogue, pick the page layout, and preview the result.
 */
export default function PageBuilder() {
  const c = useColors();
  const { width } = useWindowDimensions();
  const nav = useNavigation();
  const [draft, setDraft] = useState<ProfileLayout | null>(null);
  const { ctx, saved } = useProfileData(undefined, draft);
  const [tab, setTab] = useState<Tab>('sections');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const savedJson = useRef('');

  // Start from the saved layout once it's loaded.
  useEffect(() => {
    if (draft || !ctx) return;
    const start = clone(saved);
    savedJson.current = JSON.stringify(start);
    history.current = [savedJson.current];
    setDraft(start);
  }, [ctx, draft, saved]);
  const dirty = !!draft && JSON.stringify(draft) !== savedJson.current;

  // Warn before leaving with unsaved changes.
  useEffect(
    () =>
      nav.addListener('beforeRemove', (e) => {
        if (!dirty || busy) return;
        e.preventDefault();
        void confirmDialog({ title: 'Discard changes?', body: 'Your page changes aren’t saved yet.', icon: 'undo', danger: true, confirmText: 'Discard', cancelText: 'Keep editing' }).then((yes) => yes && nav.dispatch(e.data.action));
      }),
    [nav, dirty, busy],
  );

  if (!ctx || !draft) return <View style={{ flex: 1, backgroundColor: c.surface }}><ScreenHeader title="Edit your page" /></View>;

  /** Applies a change and records an undo step. */
  function update(fn: (l: ProfileLayout) => void) {
    const next = clone(draft!);
    fn(next);
    const snap = JSON.stringify(next);
    history.current = [...history.current.slice(0, cursor + 1), snap].slice(-80);
    setCursor(history.current.length - 1);
    setDraft(next);
  }
  function jump(i: number) {
    setCursor(i);
    setDraft(JSON.parse(history.current[i]));
  }
  function add(type: SectionType) {
    const def = sectionDef(type);
    const existing = !def?.multi && draft!.sections.find((s) => s.type === type);
    if (existing) { setTab('sections'); setEditing(existing.id); return; }
    if (draft!.sections.length >= MAX_PROFILE_SECTIONS) return toast({ kind: 'error', title: `A page can hold ${MAX_PROFILE_SECTIONS} sections` });
    const s = makeSection(type);
    update((l) => l.sections.push(s));
    haptic.light();
    toast({ kind: 'info', title: `${def?.emoji ?? ''} ${def?.label} added — drag it into place` });
    setTab('sections');
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api.updateLayout(draft!);
      session.set({ user: r.user });
      savedJson.current = JSON.stringify(r.layout);
      setDraft(r.layout);
      toast({ kind: 'info', title: 'Your page is live ✨' });
      router.back();
    } catch (e) { errorToast(e); } finally { setBusy(false); }
  }
  const editingSection = draft.sections.find((s) => s.id === editing) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScreenHeader
        title="Edit your page"
        right={
          <Row gap={2} style={{ marginRight: 8 }}>
            <IconButton name="undo" label="Undo" size={38} onPress={cursor > 0 ? () => jump(cursor - 1) : undefined} color={cursor > 0 ? c.onSurface : c.outlineVariant} />
            <IconButton name="redo" label="Redo" size={38} onPress={cursor < history.current.length - 1 ? () => jump(cursor + 1) : undefined} color={cursor < history.current.length - 1 ? c.onSurface : c.outlineVariant} />
            <Button small title="Save" loading={busy} onPress={save} />
          </Row>
        }
      />
      <Row gap={6} style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        {([['sections', 'Sections'], ['add', 'Add'], ['page', 'Page'], ['preview', 'Preview']] as const).map(([k, l]) => <Chip key={k} label={l} active={tab === k} onPress={() => setTab(k)} />)}
      </Row>

      {tab === 'sections' ? (
        <ReorderableList
          data={draft.sections}
          keyExtractor={(s) => s.id}
          onReorder={({ from, to }: ReorderableListReorderEvent) => { update((l) => (l.sections = reorderItems(l.sections, from, to))); haptic.light(); }}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 80, gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}
          ListHeaderComponent={<Text variant="bodySm" color={c.onSurfaceVariant} style={{ marginBottom: 6 }}>Hold ⠿ and drag to reorder. Tap a section for its settings.</Text>}
          ListEmptyComponent={<View style={{ padding: 30, alignItems: 'center' }}><Text variant="headlineSm">Your page is empty</Text><Button small title="Add sections" style={{ marginTop: 10 }} onPress={() => setTab('add')} /></View>}
          renderItem={({ item }) => <SectionRow section={item} onPress={() => setEditing(item.id)} onRemove={() => update((l) => (l.sections = l.sections.filter((s) => s.id !== item.id)))} />}
        />
      ) : tab === 'add' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
          {PROFILE_SECTIONS.map((d) => {
            const used = !d.multi && draft.sections.some((s) => s.type === d.key);
            return (
              <Tap key={d.key} onPress={() => add(d.key)} style={{ width: '48%', flexGrow: 1, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: used ? 'transparent' : c.outlineVariant, backgroundColor: used ? c.surfaceContainerLow : c.surfaceContainerLowest, opacity: used ? 0.6 : 1 }}>
                <Text style={{ fontSize: 22, lineHeight: 28 }}>{d.emoji}</Text>
                <Text variant="labelLg">{d.label}</Text>
                <Text variant="bodySm" color={c.onSurfaceVariant} numberOfLines={2}>{used ? 'On your page — tap to edit' : d.desc}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      ) : tab === 'page' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
          <View style={{ gap: 8 }}>
            <Label>Start from a preset</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LAYOUT_PRESETS.map((p) => (
                <Tap key={p.key} onPress={async () => { if (await confirmDialog({ title: `Use “${p.label}”?`, body: 'This replaces your sections. You can undo.', icon: 'view-quilt', confirmText: 'Use it' })) update((l) => Object.assign(l, p.build())); }} style={{ width: '48%', flexGrow: 1, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: c.outlineVariant }}>
                  <Text variant="labelLg">{p.label}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>{p.desc}</Text>
                </Tap>
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>Header</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HEADER_STYLES.map((h) => (
                <Tap key={h.key} onPress={() => update((l) => (l.header = h.key))} style={{ width: '48%', flexGrow: 1, borderRadius: 14, padding: 10, borderWidth: 2, borderColor: draft.header === h.key ? c.flame : c.outlineVariant }}>
                  <Text variant="labelLg">{h.label}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>{h.desc}</Text>
                </Tap>
              ))}
            </View>
          </View>
          <Choice label="Page width" options={PAGE_WIDTHS} value={draft.width} onPick={(v) => update((l) => (l.width = v as ProfileLayout['width']))} note="Shows on tablets and desktop; phones use the full screen." />
          <Choice label="Spacing" options={SECTION_GAPS} value={draft.gap} onPick={(v) => update((l) => (l.gap = v as ProfileLayout['gap']))} />
          <Choice label="Corners" options={CORNER_STYLES} value={draft.corners} onPick={(v) => update((l) => (l.corners = v as ProfileLayout['corners']))} />
          <Choice label="Font" options={PROFILE_FONTS} value={draft.font} onPick={(v) => update((l) => (l.font = v as ProfileLayout['font']))} />
          <Button title="Background, colours, cover & song" icon="palette" variant="secondary" onPress={() => router.push('/customize')} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <ProfileBackdrop profile={ctx.user.profile} />
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 16, maxWidth: PAGE_WIDTHS.find((w) => w.key === draft.width)?.px ?? 1040, width: '100%', alignSelf: 'center' }}>
            <ProfileHeader ctx={{ ...ctx, preview: true }} preview />
            <SectionGrid ctx={{ ...ctx, preview: true }} width={Math.min(width, PAGE_WIDTHS.find((w) => w.key === draft.width)?.px ?? 1040) - 32} onSectionPress={(id) => setEditing(id)} />
          </ScrollView>
        </View>
      )}

      <Modal visible={!!editingSection} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setEditing(null)} />
        {editingSection ? (
          <View style={{ maxHeight: '80%', backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
            <SectionSettings
              section={editingSection}
              onChange={(fn) => update((l) => { const s = l.sections.find((x) => x.id === editingSection.id); if (s) fn(s); })}
              onRemove={() => { update((l) => (l.sections = l.sections.filter((s) => s.id !== editingSection.id))); setEditing(null); }}
              onClose={() => setEditing(null)}
            />
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

function SectionRow({ section, onPress, onRemove }: { section: ProfileSection; onPress: () => void; onRemove: () => void }) {
  const c = useColors();
  const drag = useReorderableDrag();
  const active = useIsActive();
  const def = sectionDef(section.type);
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: active ? c.sunlit : c.surfaceContainerLowest, borderWidth: 1, borderColor: active ? c.flame : c.outlineVariant, transform: [{ scale: active ? 1.02 : 1 }] }}>
      <Pressable onLongPress={drag} delayLongPress={150} hitSlop={8} accessibilityLabel="Hold and drag to move" style={{ padding: 4 }}><Icon name="drag-indicator" color={c.onSurfaceVariant} /></Pressable>
      <Text style={{ fontSize: 20, lineHeight: 26 }}>{def?.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" numberOfLines={1}>{section.title || def?.label}</Text>
        <Text variant="bodySm" color={c.onSurfaceVariant}>{SECTION_SIZES.find((z) => z.key === section.size)?.label} width · {SECTION_STYLES.find((s) => s.key === section.style)?.label}</Text>
      </View>
      <IconButton name="tune" label="Settings" size={34} onPress={onPress} />
      <IconButton name="close" label="Remove" size={34} onPress={onRemove} />
    </Pressable>
  );
}

function Choice({ label, options, value, onPick, note }: { label: string; options: { key: string; label: string }[]; value: string; onPick: (k: string) => void; note?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>{options.map((o) => <Chip key={o.key} label={o.label} active={value === o.key} onPress={() => onPick(o.key)} />)}</Row>
      {note ? <Text variant="bodySm" color={c.onSurfaceVariant}>{note}</Text> : null}
    </View>
  );
}

/** Settings for one section: title, width, box style and its own options. */
function SectionSettings({ section, onChange, onRemove, onClose }: { section: ProfileSection; onChange: (fn: (s: ProfileSection) => void) => void; onRemove: () => void; onClose: () => void }) {
  const c = useColors();
  const def = sectionDef(section.type)!;
  const spec = def.config ?? {};
  const cfg = section.config;
  const [video, setVideo] = useState(cfg.videoId ? `https://youtu.be/${cfg.videoId}` : '');
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Row gap={10}>
        <Text style={{ fontSize: 28, lineHeight: 34 }}>{def.emoji}</Text>
        <View style={{ flex: 1 }}><Text variant="headlineSm">{def.label}</Text><Text variant="bodySm" color={c.onSurfaceVariant}>{def.desc}</Text></View>
        <IconButton name="close" label="Done" onPress={onClose} />
      </Row>
      {section.type !== 'spacer' ? <View style={{ gap: 6 }}><Label>Title</Label><Input value={section.title} placeholder={def.label} maxLength={40} onChangeText={(t) => onChange((s) => (s.title = t))} /></View> : null}
      <View style={{ gap: 6 }}>
        <Label>Width (tablets & desktop)</Label>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{SECTION_SIZES.filter((z) => def.sizes.includes(z.key)).map((z) => <Chip key={z.key} label={z.label} active={section.size === z.key} onPress={() => onChange((s) => (s.size = z.key))} />)}</Row>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Box style</Label>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>{SECTION_STYLES.map((st) => <Chip key={st.key} label={st.label} active={section.style === st.key} onPress={() => onChange((s) => (s.style = st.key))} />)}</Row>
      </View>
      {spec.limit ? (
        <View style={{ gap: 6 }}>
          <Label>How many to show: {cfg.limit}</Label>
          <Row gap={6}>
            <IconButton name="remove" label="Fewer" size={38} onPress={() => onChange((s) => (s.config.limit = Math.max(spec.limit!.min ?? 1, (s.config.limit ?? 1) - 1)))} />
            <IconButton name="add" label="More" size={38} onPress={() => onChange((s) => (s.config.limit = Math.min(spec.limit!.max ?? 24, (s.config.limit ?? 1) + 1)))} />
          </Row>
        </View>
      ) : null}
      {spec.columns ? <View style={{ gap: 6 }}><Label>Columns</Label><Row gap={6}>{[2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} active={cfg.columns === n} onPress={() => onChange((s) => (s.config.columns = n))} />)}</Row></View> : null}
      {section.type === 'text' ? <View style={{ gap: 6 }}><Label>Text</Label><Input value={cfg.body ?? ''} multiline maxLength={1500} style={{ minHeight: 140 }} placeholder="Anything you want people to know…" onChangeText={(t) => onChange((s) => (s.config.body = t))} /></View> : null}
      {section.type === 'quote' ? (
        <>
          <View style={{ gap: 6 }}><Label>Quote</Label><Input value={cfg.text ?? ''} multiline maxLength={200} onChangeText={(t) => onChange((s) => (s.config.text = t))} /></View>
          <View style={{ gap: 6 }}><Label>Who said it (optional)</Label><Input value={cfg.by ?? ''} maxLength={60} onChangeText={(t) => onChange((s) => (s.config.by = t))} /></View>
        </>
      ) : null}
      {section.type === 'video' ? (
        <View style={{ gap: 6 }}>
          <Label>YouTube link</Label>
          <Input value={video} autoCapitalize="none" placeholder="https://youtu.be/…" onChangeText={(t) => { setVideo(t); const id = parseYouTube(t); if (id) onChange((s) => (s.config.videoId = id)); }} />
          {video && !parseYouTube(video) ? <Text variant="bodySm" color={c.error}>That isn’t a YouTube link.</Text> : null}
        </View>
      ) : null}
      {section.type === 'spacer' ? <View style={{ gap: 6 }}><Label>Height</Label><Row gap={6}>{(['sm', 'md', 'lg'] as const).map((h) => <Chip key={h} label={{ sm: 'Small', md: 'Medium', lg: 'Large' }[h]} active={cfg.height === h} onPress={() => onChange((s) => (s.config.height = h))} />)}</Row></View> : null}
      {section.type === 'links' || section.type === 'currently' ? (
        <View style={{ gap: 8 }}>
          <Label>{section.type === 'links' ? 'Links' : 'Currently…'}</Label>
          {(cfg.items ?? []).map((it, i) => (
            <View key={i} style={{ gap: 6, backgroundColor: c.surfaceContainerLow, borderRadius: 14, padding: 8 }}>
              {section.type === 'links' ? (
                <>
                  <Input value={it.label} placeholder="Label (e.g. Instagram)" maxLength={40} onChangeText={(t) => onChange((s) => (s.config.items![i].label = t))} />
                  <Input value={it.url ?? ''} autoCapitalize="none" placeholder="https://…" maxLength={300} onChangeText={(t) => onChange((s) => (s.config.items![i].url = t))} />
                </>
              ) : (
                <>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>{CURRENTLY_LABELS.map((l) => <Chip key={l} label={l} active={it.label === l} onPress={() => onChange((s) => (s.config.items![i].label = l))} />)}</Row>
                  <Input value={it.value ?? ''} placeholder="e.g. The Bear, season 3" maxLength={80} onChangeText={(t) => onChange((s) => (s.config.items![i].value = t))} />
                </>
              )}
              <Button small variant="ghost" title="Remove" onPress={() => onChange((s) => s.config.items!.splice(i, 1))} />
            </View>
          ))}
          {(cfg.items ?? []).length < ((spec.items?.max as number | undefined) ?? 6) ? (
            <Button small variant="secondary" icon="add" title={section.type === 'links' ? 'Add link' : 'Add line'} onPress={() => onChange((s) => { s.config.items ??= []; s.config.items.push(section.type === 'links' ? { label: '', url: 'https://' } : { label: CURRENTLY_LABELS[s.config.items.length % CURRENTLY_LABELS.length], value: '' }); })} />
          ) : null}
        </View>
      ) : null}
      <Button variant="ghost" title="Remove section" icon="delete" onPress={onRemove} />
    </ScrollView>
  );
}
