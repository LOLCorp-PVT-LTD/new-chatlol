import { createRequire } from 'node:module';

/** English dictionary for Word Race (an-array-of-english-words, ~275k words), loaded on first use. */
let words = null;
export function isWord(w) {
  if (!words) words = new Set(createRequire(import.meta.url)('an-array-of-english-words'));
  return words.has(String(w).toLowerCase());
}
