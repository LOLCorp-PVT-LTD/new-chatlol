import { config } from '../config.js';
import { HttpError } from './http.js';
import { ruleByKey } from '@chatlol/shared';
import { actingAdmin } from './actor.js';

/**
 * LOLShield: a fast local filter for slurs/harassment + optional NVIDIA NemoGuard content-safety check.
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

/** Words-list check for a request. Admins are never moderated. */
export function assertClean(text) {
  if (actingAdmin()) return;
  const r = localCheck(text);
  if (!r.ok) throw new HttpError(422, 'LOLShield caught that one — keep it kind 🧡', `moderation_${r.reason}`);
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
  const cats = [...new Set(categories)];
  const rules = rulesFor(cats);
  // A severe community rule (threats, minors, self-harm encouragement, non-consensual sharing, illegal) is always severe.
  // (Self-harm is handled with care instead: someone talking about their own struggles needs support, not a ban.)
  const severeRule = rules.some((k) => k !== 'self_harm' && ruleByKey(k)?.severity === 'severe');
  const selfHarmOnly = rules.length === 1 && rules[0] === 'self_harm' && !severe;
  return { safe: !cats.length && !modelUnsafe, severe: !selfHarmOnly && (severe || severeModel || severeRule), selfHarm: rules.includes('self_harm'), selfHarmOnly, hostile, categories: cats, rules };
}

/**
 * Maps detector categories (local word lists and NVIDIA NemoGuard's taxonomy) to the Community Guidelines rules
 * members agreed to, so every removal and strike cites the rule that was broken.
 */
const CATEGORY_RULES = [
  [/harass|bully|insult/i, 'harassment'],
  [/hate|identity/i, 'hate'],
  [/threat|violence|terror|weapon|guns/i, 'violence_threats'],
  [/criminal|controlled|drugs|trafficking|illegal/i, 'illegal'],
  [/sexual \(minor\)|minor|child/i, 'adults_only'],
  [/sexual|nudity|explicit/i, 'sexual_content'],
  [/suicide|self.?harm/i, 'self_harm'],
  [/pii|privacy|doxx/i, 'non_consensual'],
  [/scam|fraud|unauthori[sz]ed advice|manipulation/i, 'scams_fraud'],
  [/profan/i, 'profanity'],
];
export function rulesFor(categories) {
  const out = [];
  for (const c of categories) {
    const hit = CATEGORY_RULES.find(([re]) => re.test(c));
    out.push(hit ? hit[1] : 'harassment');
  }
  // Minors trump plain sexual content.
  return [...new Set(out)].sort((a, b) => (a === 'adults_only' ? -1 : b === 'adults_only' ? 1 : 0));
}
export const ruleReason = (keys, fallback = 'Community Guidelines') => {
  const r = ruleByKey(keys?.[0]);
  return r ? `Broke the rule “${r.title}”` : fallback;
};

/** Asynchronous deep check with NemoGuard; returns false if the model flags the text as unsafe. */
export async function deepCheck(text) {
  if (!config.nim.apiKey || !config.nim.safetyModel) return true;
  return (await classify(text)).safe;
}
