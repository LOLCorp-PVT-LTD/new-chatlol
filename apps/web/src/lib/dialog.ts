import { shallowRef } from 'vue';

/**
 * In-app dialogs that replace the browser's alert / confirm / prompt boxes. Rendered by <DialogHost> (in App.vue)
 * in the app's own style. Every helper returns a promise, so code reads like the old blocking calls:
 *   if (!(await confirmDialog({ title: 'Delete this shout?', danger: true }))) return;
 */
export type DialogField =
  | { key: string; type: 'text' | 'textarea'; label?: string; placeholder?: string; value?: string; maxLength?: number; required?: boolean; suggestions?: string[] }
  | { key: string; type: 'toggle'; label: string; hint?: string; value?: boolean }
  | { key: string; type: 'choices'; label?: string; options: { value: string; label: string; emoji?: string }[]; value?: string; required?: boolean };

export interface DialogOptions {
  title: string;
  body?: string;
  /** Material Symbols icon name shown at the top. */
  icon?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  /** Just an OK button (alerts). */
  hideCancel?: boolean;
  fields?: DialogField[];
}
export type DialogValues = Record<string, string | boolean>;
interface OpenDialog extends DialogOptions {
  id: number;
  resolve: (v: DialogValues | null) => void;
}

export const dialogs = shallowRef<OpenDialog[]>([]);
let seq = 0;

/** Opens a dialog; resolves with the field values (an empty object when there are none), or null if cancelled. */
export function formDialog(opts: DialogOptions): Promise<DialogValues | null> {
  return new Promise((resolve) => {
    const d: OpenDialog = {
      ...opts,
      id: ++seq,
      resolve: (v) => {
        dialogs.value = dialogs.value.filter((x) => x.id !== d.id);
        resolve(v);
      },
    };
    dialogs.value = [...dialogs.value, d];
  });
}

export async function confirmDialog(opts: DialogOptions): Promise<boolean> {
  return (await formDialog({ confirmText: 'OK', ...opts })) !== null;
}

export async function alertDialog(opts: Omit<DialogOptions, 'hideCancel'>): Promise<void> {
  await formDialog({ confirmText: 'Got it', ...opts, hideCancel: true });
}

/** One text answer, or null if cancelled. */
export async function promptDialog(
  opts: DialogOptions & { label?: string; placeholder?: string; value?: string; maxLength?: number; required?: boolean; multiline?: boolean },
): Promise<string | null> {
  const r = await formDialog({
    ...opts,
    fields: [{ key: 'value', type: opts.multiline ? 'textarea' : 'text', label: opts.label, placeholder: opts.placeholder, value: opts.value, maxLength: opts.maxLength, required: opts.required }],
  });
  return r ? String(r.value ?? '') : null;
}

/** The report dialog used for people, posts, shouts and comments. Returns the reason text or null. */
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
  if (!r) return null;
  return [r.reason, r.details].filter((x) => typeof x === 'string' && x.trim()).join(' — ');
}
