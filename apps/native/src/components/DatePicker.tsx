import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MONTHS, WEEKDAYS, formatDate, monthGrid, parseIsoDate, toIsoDate } from '@chatlol/shared';
import { haptic } from '../lib/native';
import { gradients, shadow, useColors } from '../lib/theme';
import { Gradient, Icon, IconButton, Row, Tap, Text } from './ui';

type View3 = 'days' | 'months' | 'years';

/**
 * Sunset-styled date picker in a bottom sheet: pick a year, a month, then a day.
 * `startView="years"` suits birthdays. Works the same on iOS, Android and the web/desktop build.
 */
export function DatePicker({ value, onChange, min = '1900-01-01', max, placeholder = 'Pick a date', startView = 'days', defaultYear, label }: {
  value: string; onChange: (iso: string) => void; min?: string; max?: string; placeholder?: string; startView?: View3; defaultYear?: number; label?: string;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const today = new Date().toISOString().slice(0, 10);
  const maxIso = max ?? '9999-12-31';
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View3>(startView);
  const initial = () => parseIsoDate(value) ?? { y: defaultYear ?? Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1, d: 1 };
  const [cur, setCur] = useState(initial);
  const minY = Number(min.slice(0, 4));
  const maxY = Number(maxIso.slice(0, 4));
  const pageStart = cur.y - (cur.y % 20);
  const cells = useMemo(() => monthGrid(cur.y, cur.m), [cur.y, cur.m]);
  const selected = parseIsoDate(value);

  function show() { setCur(initial()); setView(value ? 'days' : startView); setOpen(true); }
  function shift(delta: number) {
    haptic.tap();
    if (view === 'years') setCur({ ...cur, y: cur.y + delta * 20 });
    else if (view === 'months') setCur({ ...cur, y: cur.y + delta });
    else { const d = new Date(Date.UTC(cur.y, cur.m + delta, 1)); setCur({ y: d.getUTCFullYear(), m: d.getUTCMonth(), d: 1 }); }
  }
  const canPrev = view === 'years' ? pageStart > minY : view === 'months' ? cur.y > minY : toIsoDate(cur.y, cur.m, 1) > min;
  const canNext = view === 'years' ? pageStart + 19 < maxY : view === 'months' ? cur.y < maxY : toIsoDate(cur.y, cur.m + 1, 1) <= maxIso;
  const off = (iso: string) => iso < min || iso > maxIso;

  const pill = (active: boolean, disabled: boolean) => ({
    height: 46, borderRadius: 23, alignItems: 'center' as const, justifyContent: 'center' as const, opacity: disabled ? 0.3 : 1,
    backgroundColor: active ? c.flame : 'transparent',
  });

  return (
    <>
      <Tap onPress={show} accessibilityRole="button" accessibilityLabel={label ?? placeholder}
        style={{ minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: open ? c.flame : c.sandstone, backgroundColor: c.surfaceContainerLowest, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="calendar-month" color={c.flame} />
        <Text variant="bodyLg" color={value ? c.onSurface : c.outline} style={{ flex: 1 }}>{value ? formatDate(value) : placeholder}</Text>
        <Icon name="expand-more" />
      </Tap>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(26,17,12,0.55)' }} onPress={() => setOpen(false)} accessibilityLabel="Close date picker" />
        <View style={[{ backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 18, paddingBottom: insets.bottom + 18, gap: 12 }, shadow.float]}>
          <Row>
            <Text variant="headlineMd" style={{ flex: 1 }}>{label ?? 'Pick a date'}</Text>
            {value ? <Text variant="labelLg" color={c.flame}>{formatDate(value)}</Text> : null}
          </Row>
          <Row gap={6}>
            <IconButton name="chevron-left" label="Previous" onPress={canPrev ? () => shift(-1) : undefined} color={canPrev ? c.onSurface : c.outlineVariant} />
            <Tap onPress={() => setView(view === 'days' ? 'months' : 'years')} style={{ flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceContainerLow }}>
              <Text variant="labelLg">{view === 'days' ? `${MONTHS[cur.m]} ${cur.y}` : view === 'months' ? String(cur.y) : `${pageStart} – ${pageStart + 19}`}</Text>
            </Tap>
            <IconButton name="chevron-right" label="Next" onPress={canNext ? () => shift(1) : undefined} color={canNext ? c.onSurface : c.outlineVariant} />
          </Row>

          {view === 'years' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: 20 }, (_, i) => pageStart + i).map((y) => {
                const dis = y < minY || y > maxY;
                return (
                  <View key={y} style={{ width: '25%', padding: 3 }}>
                    <Tap disabled={dis} onPress={() => { haptic.tap(); setCur({ ...cur, y }); setView('months'); }} style={pill(selected?.y === y, dis)}>
                      <Text variant="labelLg" color={selected?.y === y ? '#fff' : c.onSurface}>{y}</Text>
                    </Tap>
                  </View>
                );
              })}
            </View>
          ) : view === 'months' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {MONTHS.map((name, m) => {
                const dis = toIsoDate(cur.y, m, 1) > maxIso || toIsoDate(cur.y, m + 1, 0) < min;
                const active = selected?.y === cur.y && selected.m === m;
                return (
                  <View key={name} style={{ width: '33.33%', padding: 3 }}>
                    <Tap disabled={dis} onPress={() => { haptic.tap(); setCur({ ...cur, m }); setView('days'); }} style={pill(active, dis)}>
                      <Text variant="labelLg" color={active ? '#fff' : c.onSurface}>{name.slice(0, 3)}</Text>
                    </Tap>
                  </View>
                );
              })}
            </View>
          ) : (
            <View>
              <View style={{ flexDirection: 'row' }}>{WEEKDAYS.map((w) => <Text key={w} variant="labelSm" color={c.onSurfaceVariant} style={{ width: '14.28%', textAlign: 'center', paddingVertical: 4 }}>{w}</Text>)}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {cells.map((cell) => {
                  const dis = off(cell.iso);
                  const active = cell.iso === value;
                  return (
                    <View key={cell.iso} style={{ width: '14.28%', aspectRatio: 1, padding: 2 }}>
                      <Tap disabled={dis} accessibilityLabel={formatDate(cell.iso)} accessibilityState={{ selected: active, disabled: dis }}
                        onPress={() => { haptic.success(); onChange(cell.iso); setOpen(false); }}
                        style={{ flex: 1, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.25 : 1, borderWidth: cell.iso === today && !active ? 1 : 0, borderColor: c.flame }}>
                        {active ? <Gradient colors={gradients.sunset} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
                        <Text variant="labelLg" color={active ? '#fff' : cell.inMonth ? c.onSurface : c.outline}>{cell.d}</Text>
                      </Tap>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="labelMd" color={c.onSurfaceVariant} onPress={() => setView('years')}>Jump to year</Text>
            <Text variant="labelMd" color={c.flame} onPress={() => setOpen(false)}>{value ? 'Done' : 'Cancel'}</Text>
          </Row>
        </View>
      </Modal>
    </>
  );
}
