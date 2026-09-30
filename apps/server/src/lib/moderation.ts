import { config } from '../config';
import { HttpError } from './http';

/**
 * SafeShield: a fast local filter for slurs/harassment + optional NVIDIA NemoGuard content-safety check.
 * The local list is intentionally short here — plug in your own maintained list in production.
 */
const BLOCKED = [
  /\bk+y+s+\b/i, /\bkill\s+your\s*self\b/i, /\bgo\s+die\b/i, /\bn[i1]gg(?:er|a)s?\b/i, /\bf[a4]gg?[o0]ts?\b/i,
  /\bretards?\b/i, /\btr[a4]nn(?:y|ies)\b/i, /\bch[i1]nks?\b/i, /\bsp[i1]cs?\b/i,
];
const CONTACT_SCAM = [/\bcash\s*app\b/i, /\bgift\s*cards?\b/i, /\bwire\s+me\b/i, /\bcrypto\s+investment\b/i];

export function localCheck(text: string): { ok: boolean; reason?: string } {
  if (BLOCKED.some((r) => r.test(text))) return { ok: false, reason: 'harassment' };
  if (CONTACT_SCAM.some((r) => r.test(text))) return { ok: false, reason: 'scam' };
  return { ok: true };
}

export function assertClean(text: string) {
  const r = localCheck(text);
  if (!r.ok) throw new HttpError(422, 'SafeShield caught that one — keep it kind 🧡', `moderation_${r.reason}`);
}

/** Asynchronous deep check with NemoGuard; returns false if the model flags the text as unsafe. */
export async function deepCheck(text: string): Promise<boolean> {
  if (!config.nim.apiKey || !config.nim.safetyModel) return true;
  try {
    const res = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.nim.apiKey}` },
      body: JSON.stringify({ model: config.nim.safetyModel, messages: [{ role: 'user', content: text }], max_tokens: 64 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    return !/"User Safety"\s*:\s*"unsafe"/i.test(content);
  } catch {
    return true;
  }
}
