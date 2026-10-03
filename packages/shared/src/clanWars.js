/**
 * Clan Wars with modes. A war isn't just "who earned more": it's fought on several fronts, each worth War Points, so a
 * small, coordinated clan can beat a big idle one.
 *
 * Fronts (`cats`): xp = Social Domination (Clan XP earned), social = social actions, wins = game wins, active = members
 * taking part, participation = % of the roster taking part, missions = war missions completed.
 * Race modes (Bounty, Chaos) are won by claiming challenges first; King of the Hill by holding the Clan XP lead longest.
 */
export const WAR_FRONTS = {
  xp: 'Social Domination',
  social: 'Social actions',
  wins: 'Gaming',
  active: 'Activity',
  participation: 'Participation',
  missions: 'Missions',
};
export const CLAN_WAR_MODES = [
  { key: 'total', name: 'Total War', emoji: '⚔️', desc: 'Five fronts: Social Domination, Activity, Gaming, Missions and Participation.', cats: { xp: 30, active: 20, wins: 20, missions: 15, participation: 15 } },
  { key: 'rep', name: 'Rep War', emoji: '⭐', desc: 'Earn the most Clan XP.', cats: { xp: 100 } },
  { key: 'social', name: 'Social War', emoji: '💬', desc: 'Most posts, shouts and comments.', cats: { social: 100 } },
  { key: 'activity', name: 'Activity War', emoji: '🙌', desc: 'Most members taking part — and the biggest share of your roster.', cats: { active: 60, participation: 40 } },
  { key: 'game', name: 'Game War', emoji: '🎮', desc: 'Win the most games (arena, tournaments).', cats: { wins: 100 } },
  { key: 'mission', name: 'Mission War', emoji: '📜', desc: 'Complete the most war missions.', cats: { missions: 100 } },
  { key: 'bounty', name: 'Bounty War', emoji: '🎯', desc: 'Targeted challenges, all open from the start — first clan to finish each claims its points.', race: true },
  { key: 'koth', name: 'King of the Hill', emoji: '👑', desc: 'Hold the Clan XP lead for the longest time.', koth: true },
  { key: 'chaos', name: 'Chaos', emoji: '🌀', desc: 'Random objectives drop throughout the war — race to grab each one.', race: true, chaos: true },
];
export const warModeFor = (key) => CLAN_WAR_MODES.find((m) => m.key === key) ?? CLAN_WAR_MODES[1];
export const WAR_HOURS = [6, 24, 48, 72];

/** War missions (each side completes its own): scaled to the war's length. */
export function warMissions(hours) {
  return [
    { kind: 'xp', label: `Earn ${(40 * hours).toLocaleString('en')} Clan XP`, target: 40 * hours },
    { kind: 'social', label: `${2 * hours} social actions`, target: 2 * hours },
    { kind: 'wins', label: `Win ${Math.max(2, Math.round(hours / 8))} games`, target: Math.max(2, Math.round(hours / 8)) },
    { kind: 'active', label: `${Math.max(3, Math.round(hours / 6))} members take part`, target: Math.max(3, Math.round(hours / 6)) },
  ];
}

/** Race challenges for Bounty and Chaos wars. `seed` makes them the same for both sides; Chaos ones drop over time. */
export function warRaces(mode, hours, seed = 1) {
  let x = seed % 2147483647 || 1;
  const rnd = () => ((x = (x * 48271) % 2147483647) / 2147483647);
  const kinds = [
    { kind: 'xp', label: (n) => `First to ${n.toLocaleString('en')} Clan XP`, n: () => Math.round((15 + rnd() * 25) * Math.max(1, hours / 6)) * 10 },
    { kind: 'social', label: (n) => `First to ${n} social actions`, n: () => Math.round((6 + rnd() * 10) * Math.max(1, hours / 12)) },
    { kind: 'wins', label: (n) => `First to win ${n} game${n === 1 ? '' : 's'}`, n: () => 1 + Math.round(rnd() * 3) },
    { kind: 'active', label: (n) => `First to get ${n} members involved`, n: () => 2 + Math.round(rnd() * 4) },
  ];
  const count = mode === 'chaos' ? Math.max(4, Math.min(10, Math.round(hours / 4))) : 5;
  return Array.from({ length: count }, (_, i) => {
    const k = kinds[Math.floor(rnd() * kinds.length)];
    const target = k.n();
    return { id: i, kind: k.kind, label: k.label(target), target, points: mode === 'chaos' ? 10 + Math.round(rnd() * 4) * 5 : 20, at: mode === 'chaos' ? Math.round(((i + 0.3) / count) * hours * 3_600_000) : 0 };
  });
}

/**
 * War Points so far. `w`: { mode, a, b } with sides { xp, social, wins, active (count), members, missions },
 * plus `races` (claimedBy 'a'|'b') and `koth` ({ a, b } ms held, `lead`, `since`).
 */
export function warScore(w, at = Date.now()) {
  const mode = warModeFor(w.mode);
  const A = w.a ?? {};
  const B = w.b ?? {};
  const front = (k, s) => (k === 'participation' ? (s.active ?? 0) / Math.max(1, s.members ?? 1) : s[k] ?? 0);
  if (mode.race) {
    const pts = (side) => (w.races ?? []).filter((r) => r.claimedBy === side).reduce((n, r) => n + r.points, 0);
    return { a: pts('a'), b: pts('b'), fronts: [] };
  }
  if (mode.koth) {
    const k = w.koth ?? {};
    const run = k.lead && k.since ? Math.max(0, Math.min(at, Date.parse(w.endsAt ?? new Date(at).toISOString())) - k.since) : 0;
    const a = Math.floor(((k.a ?? 0) + (k.lead === 'a' ? run : 0)) / 60_000);
    const b = Math.floor(((k.b ?? 0) + (k.lead === 'b' ? run : 0)) / 60_000);
    return { a, b, fronts: [{ key: 'xp', label: 'Minutes in the lead', weight: 0, a, b }] };
  }
  const fronts = Object.entries(mode.cats).map(([key, weight]) => {
    const va = front(key, A);
    const vb = front(key, B);
    return { key, label: WAR_FRONTS[key], weight, a: va, b: vb, winner: va === vb ? null : va > vb ? 'a' : 'b' };
  });
  const pts = (side) => fronts.reduce((n, f) => n + (f.winner === side ? f.weight : f.winner === null && (f.a || f.b) ? f.weight / 2 : 0), 0);
  return { a: pts('a'), b: pts('b'), fronts };
}
