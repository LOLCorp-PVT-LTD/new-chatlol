/**
 * Inserts text (an emoji, a :custom_emoji:) where the caret is in an input / textarea and returns the new value.
 * Puts the caret right after what was inserted and keeps focus, so you can keep typing.
 */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string, text: string): string {
  if (!el) return value + text;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  // Custom emoji codes get a space so they don't run into the next word.
  const add = text.startsWith(':') && start > 0 && !/\s$/.test(value.slice(0, start)) ? ` ${text}` : text;
  const next = value.slice(0, start) + add + value.slice(end);
  const caret = start + add.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
  return next;
}
