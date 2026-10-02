import { useRef } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

/**
 * Inserting emoji where the caret is in a TextInput: spread `onSelectionChange` on the input and call `insert`.
 * Custom emoji codes get a space before them so they don't run into the previous word.
 */
export function useCaretInsert(value: string, setValue: (v: string) => void) {
  const sel = useRef<{ start: number; end: number } | null>(null);
  return {
    onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      sel.current = e.nativeEvent.selection;
    },
    insert: (text: string) => {
      const start = Math.min(sel.current?.start ?? value.length, value.length);
      const end = Math.min(sel.current?.end ?? value.length, value.length);
      const add = text.startsWith(':') && start > 0 && !/\s$/.test(value.slice(0, start)) ? ` ${text}` : text;
      setValue(value.slice(0, start) + add + value.slice(end));
      sel.current = { start: start + add.length, end: start + add.length };
    },
  };
}
