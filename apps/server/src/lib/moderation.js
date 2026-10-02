import { config } from '../config.js';
import { HttpError } from './http.js';

/**
 * SafeShield: a fast local filter for slurs/harassment + optional NVIDIA NemoGuard content-safety check.
 * The local list is intentionally short here — plug in your own maintained list in production.
 */
const BLOCKED = [
  /\bk+y+s+\b/i,
  /\bkill\s+your\s*self\b/i,
  /\bgo\s+die\b/i,
  /\bn[i1]gg(?:er|a)s?\b/i,
  /\bf[a4]gg?[o0]ts?\b/i,
  /\bretards?\b/i,
  /\btr[a4]nn(?:y|ies)\b/i,
  /\bch[i1]nks?\b/i,
  /\bsp[i1]cs?\b/i,
];
const CONTACT_SCAM = [/\bcash\s*app\b/i, /\bgift\s*cards?\b/i, /\bwire\s+me\b/i, /\bcrypto\s+investment\b/i];

export function localCheck(text) {
  if (BLOCKED.some((r) => r.test(text))) return { ok: false, reason: 'harassment' };
  if (CONTACT_SCAM.some((r) => r.test(text))) return { ok: false, reason: 'scam' };
  return { ok: true };
}

export function assertClean(text) {
  const r = localCheck(text);
  if (!r.ok) throw new HttpError(422, 'SafeShield caught that one — keep it kind 🧡', `moderation_${r.reason}`);
}

/** Insults and hostility that aren't bannable on their own but add up when aimed at people repeatedly. */
const HOSTILE = [
  /\b(?:you(?:'re| are)?|ur|u r)\s+(?:so\s+)?(?:an?\s+)?(?:idiot|stupid|dumb|ugly|loser|pathetic|trash|worthless|disgusting|fat|clown)\b/i,
  /\bshut\s+(?:the\s+\w+\s+)?up\b/i,
  /\b(?:nobody|no one)\s+likes\s+you\b/i,
  /\bf+u+c*k+\s*(?:you|u|off)\b/i,
  /\bstfu\b/i,
  /\bi\s+hate\s+(?:you|u)\b/i,
];
/** Threats and criminal activity: always severe. */
const SEVERE = [
  /\b(?:i(?:'ll| will| am going to|'m gonna| gonna)\s+(?:kill|hurt|stab|shoot|find)\s+(?:you|u)\b)/i,
  /\b(?:buy|sell|selling)\s+(?:coke|cocaine|meth|fentanyl|guns?|stolen)\b/i,
  /\b(?:send|share)\s+nudes?\b.*\b(?:1[0-7]|minor|underage)\b/i,
  /\bcredit\s+card\s+(?:dumps?|numbers?)\b/i,
];

export const isHostile = (text) => HOSTILE.some((r) => r.test(text));

/**
 * Classifies text: { safe, severe, hostile, categories[] }. Uses the local rules always, plus NVIDIA NemoGuard
 * content safety when NIM_SAFETY_MODEL is set.
 */
export async function classify(text) {
  const categories = [];
  const local = localCheck(text);
  if (!local.ok) categories.push(local.reason === 'scam' ? 'Scam' : 'Harassment');
  const severe = SEVERE.some((r) => r.test(text));
  if (severe) categories.push('Threat / Criminal');
  const hostile = isHostile(text);
  let modelUnsafe = false;
  if (config.nim.apiKey && config.nim.safetyModel) {
    try {
      const { nimPost } = await import('../ai/nim.js');
      const res = await nimPost(
        `${config.nim.baseUrl}/chat/completions`,
        { model: config.nim.safetyModel, messages: [{ role: 'user', content: text }], max_tokens: 64 },
        { timeout: 8000 },
      );
      if (res?.ok) {
        const content = (await res.json()).choices?.[0]?.message?.content ?? '';
        modelUnsafe = /"User Safety"\s*:\s*"unsafe"/i.test(content);
        const cats = content.match(/"Safety Categories"\s*:\s*"([^"]*)"/i)?.[1];
        if (modelUnsafe && cats)
          categories.push(
            ...cats
              .split(',')
              .map((c) => c.trim())
              .filter(Boolean),
          );
      }
    } catch {
      /* model unavailable: local rules still apply */
    }
  }
  const severeModel = categories.some((c) => /threat|criminal|weapons|controlled|child|minor|sexual \(minor\)|human trafficking/i.test(c));
  return { safe: !categories.length && !modelUnsafe, severe: severe || severeModel, hostile, categories: [...new Set(categories)] };
}

/** Asynchronous deep check with NemoGuard; returns false if the model flags the text as unsafe. */
export async function deepCheck(text) {
  if (!config.nim.apiKey || !config.nim.safetyModel) return true;
  return (await classify(text)).safe;
}
