import { useSyncExternalStore } from 'react';
import type { IconName } from '../components/ui';

/**
 * In-app dialogs and action sheets in ChatLOL's own style (instead of the system Alert box), rendered by
 * <DialogHost> in the root layout. Every helper returns a promise:
 *   if (!(await confirmDialog({ title: 'Delete this shout?', danger: true }))) return;
 */
export type DialogField =
  | { key: string; type: 'text' | 'textarea'; label?: string; placeholder?: string; value?: string; maxLength?: number; required?: boolean }
  | { key: string; type: 'choices'; label?: string; options: { value: string; label: string; emoji?: string }[]; value?: string; required?: boolean };
export interface DialogOptions {
  title: string;
  body?: string;
  icon?: IconName;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  fields?: DialogField[];
}
export type DialogValues = Record<string, string>;
export interface SheetAction {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onPress: () => void | Promise<void>;
}
type Open =
  | ({ id: number; kind: 'dialog'; resolve: (v: DialogValues | null) => void } & DialogOptions)
  | { id: number; kind: 'sheet'; title?: string; actions: SheetAction[]; resolve: () => void };

let open: Open[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;
const close = (id: number) => {
  open = open.filter((d) => d.id !== id);
  emit();
};

export const useDialogs = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );

export function formDialog(opts: DialogOptions): Promise<DialogValues | null> {
  return new Promise((resolve) => {
    const id = ++seq;
    open = [...open, { ...opts, id, kind: 'dialog', resolve: (v) => (close(id), resolve(v)) }];
    emit();
  });
}
export const confirmDialog = async (opts: DialogOptions) => (await formDialog({ confirmText: 'OK', ...opts })) !== null;
export const alertDialog = async (opts: Omit<DialogOptions, 'hideCancel'>) => void (await formDialog({ confirmText: 'Got it', ...opts, hideCancel: true }));

/** A bottom sheet of actions (the "…" menus). Resolves when it closes. */
export function actionSheet(title: string | undefined, actions: SheetAction[]): Promise<void> {
  return new Promise((resolve) => {
    const id = ++seq;
    open = [...open, { id, kind: 'sheet', title, actions, resolve: () => (close(id), resolve()) }];
    emit();
  });
}

/** The report dialog for people, posts, shouts and comments. Returns the reason, or null if cancelled. */
export async function reportDialog(what: string): Promise<string | null> {
  const r = await formDialog({
    title: `Report ${what}`,
    body: 'SafeShield reviews every report. The person won’t know it was you.',
    icon: 'flag',
    confirmText: 'Send report',
    fields: [
      {
        key: 'reason',
        type: 'choices',
        required: true,
        options: [
          { value: 'Harassment or bullying', label: 'Harassment', emoji: '😠' },
          { value: 'Hate speech', label: 'Hate', emoji: '🚫' },
          { value: 'Spam or scam', label: 'Spam / scam', emoji: '🎣' },
          { value: 'Nudity or sexual content', label: 'Nudity', emoji: '🔞' },
          { value: 'Violence or threats', label: 'Threats', emoji: '⚠️' },
          { value: 'Impersonation', label: 'Fake account', emoji: '🎭' },
          { value: 'Underage user', label: 'Under 18', emoji: '🧒' },
          { value: 'Something else', label: 'Other', emoji: '💬' },
        ],
      },
      { key: 'details', type: 'textarea', label: 'Anything else? (optional)', placeholder: 'What happened…', maxLength: 300 },
    ],
  });
  return r ? [r.reason, r.details].filter((x) => x?.trim()).join(' — ') : null;
}
