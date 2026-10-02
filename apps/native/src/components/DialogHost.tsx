import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDialogs, type DialogValues } from '../lib/dialog';
import { useColors } from '../lib/theme';
import { haptic } from '../lib/native';
import { Icon, Input, Row, Tap, Text } from './ui';

/** Renders the in-app dialogs and action sheets opened with lib/dialog.ts. */
export function DialogHost() {
  const items = useDialogs();
  return (
    <>
      {items.map((d) => (d.kind === 'sheet' ? <Sheet key={d.id} title={d.title} actions={d.actions} onClose={d.resolve} /> : <Dialog key={d.id} d={d} />))}
    </>
  );
}

type DialogItem = Extract<ReturnType<typeof useDialogs>[number], { kind: 'dialog' }>;

function Dialog({ d }: { d: DialogItem }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<DialogValues>(() => Object.fromEntries((d.fields ?? []).map((f) => [f.key, f.value ?? ''])));
  const valid = !(d.fields ?? []).some((f) => f.required && !String(values[f.key] ?? '').trim());
  const cancel = () => d.resolve(d.hideCancel ? {} : null);
  const ok = () => {
    if (!valid) return;
    haptic.tap();
    d.resolve(values);
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={cancel} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: c.surfaceContainerLowest, borderRadius: 28, padding: 22, maxWidth: 440, width: '100%', alignSelf: 'center', marginBottom: insets.bottom }}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14 }}>
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                {d.icon || d.danger ? (
                  <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: d.danger ? c.errorContainer : c.sunlit }}>
                    <Icon name={d.icon ?? 'warning'} color={d.danger ? c.error : c.flame} />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text variant="headlineSm">{d.title}</Text>
                  {d.body ? <Text variant="bodyMd" color={c.onSurfaceVariant} style={{ marginTop: 4 }}>{d.body}</Text> : null}
                </View>
              </Row>
              {(d.fields ?? []).map((f, i) =>
                f.type === 'choices' ? (
                  <View key={f.key} style={{ gap: 6 }}>
                    {f.label ? <Text variant="labelMd" color={c.onSurfaceVariant}>{f.label}</Text> : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {f.options.map((o) => {
                        const on = values[f.key] === o.value;
                        return (
                          <Tap key={o.value} onPress={() => setValues((v) => ({ ...v, [f.key]: o.value }))} style={{ width: '48%', flexGrow: 1, height: 44, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? c.flame : c.outlineVariant, backgroundColor: on ? c.sunlit : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
                            {o.emoji ? <Text>{o.emoji}</Text> : null}
                            <Text variant="labelLg">{o.label}</Text>
                          </Tap>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View key={f.key} style={{ gap: 6 }}>
                    {f.label ? <Text variant="labelMd" color={c.onSurfaceVariant}>{f.label}</Text> : null}
                    <Input value={values[f.key]} onChangeText={(t) => setValues((v) => ({ ...v, [f.key]: t }))} placeholder={f.placeholder} maxLength={f.maxLength} multiline={f.type === 'textarea'} autoFocus={i === 0 && f.type === 'text'} style={f.type === 'textarea' ? { minHeight: 90 } : undefined} onSubmitEditing={f.type === 'text' ? ok : undefined} />
                  </View>
                ),
              )}
            </ScrollView>
            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 20 }}>
              {!d.hideCancel ? (
                <Tap onPress={cancel} style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center', backgroundColor: c.surfaceContainerLow }}>
                  <Text variant="labelLg" color={c.flame}>{d.cancelText ?? 'Cancel'}</Text>
                </Tap>
              ) : null}
              <Tap onPress={ok} disabled={!valid} style={{ height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center', backgroundColor: d.danger ? c.error : c.flame, opacity: valid ? 1 : 0.5 }}>
                <Text variant="labelLg" color="#fff">{d.confirmText ?? 'OK'}</Text>
              </Tap>
            </Row>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Sheet({ title, actions, onClose }: { title?: string; actions: { label: string; icon?: React.ComponentProps<typeof Icon>['name']; danger?: boolean; onPress: () => void | Promise<void> }[]; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  useEffect(() => haptic.tap(), []);
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: c.surfaceContainerLowest, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingBottom: Math.max(16, insets.bottom), paddingHorizontal: 12, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.outlineVariant, alignSelf: 'center', marginBottom: 8 }} />
          {title ? <Text variant="labelLg" color={c.onSurfaceVariant} style={{ textAlign: 'center', marginBottom: 6 }}>{title}</Text> : null}
          {actions.map((a) => (
            <Tap
              key={a.label}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                onClose();
                await a.onPress();
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16 }}
            >
              {a.icon ? <Icon name={a.icon} color={a.danger ? c.error : c.onSurface} /> : null}
              <Text variant="labelLg" color={a.danger ? c.error : c.onSurface}>{a.label}</Text>
            </Tap>
          ))}
          <Tap onPress={onClose} style={{ marginTop: 4, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceContainerLow }}>
            <Text variant="labelLg">Cancel</Text>
          </Tap>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
