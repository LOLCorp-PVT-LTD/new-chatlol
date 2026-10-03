/**
 * Staff permissions. Admins have every permission. Moderators start with the moderation basics. Anyone holding
 * `staff` can grant extra permissions to individual people, but only ones they hold themselves. Only admins can
 * make someone an admin.
 */
export const PERMISSIONS = [
  { key: 'overview', label: 'Dashboard', desc: 'Stats, revenue totals and integrations', group: 'Panel' },
  { key: 'reports', label: 'Reports & flags', desc: 'Review reports and LOLShield flags, remove content', group: 'Moderation' },
  { key: 'mute', label: 'Warn, mute & suspend', desc: 'Temporary restrictions and clearing strikes', group: 'Moderation' },
  { key: 'ban', label: 'Ban', desc: 'Ban and unban accounts', group: 'Moderation' },
  { key: 'terminate', label: 'Terminate accounts', desc: 'Permanently close an account and scrub its personal data', group: 'Moderation' },
  { key: 'wallet', label: 'Sparks & Gems', desc: 'Add or remove Sparks and Gems', group: 'Economy' },
  { key: 'premium', label: 'Premium', desc: 'Give or remove Premium days', group: 'Economy' },
  { key: 'profiles', label: 'Edit profiles', desc: 'Change names, handles, bios; remove pictures and covers', group: 'Moderation' },
  { key: 'items', label: 'Store items', desc: 'Give stickers, frames, themes and other items', group: 'Economy' },
  { key: 'boost', label: 'Boost profiles', desc: 'Feature someone at the top of Browse Members and Rate & Meet', group: 'Economy' },
  { key: 'payments', label: 'Payments', desc: 'See who paid what and the status of every payment; refund', group: 'Economy' },
  { key: 'tournaments', label: 'Tournaments', desc: 'Create, edit, cancel and pay out tournaments', group: 'Economy' },
  { key: 'ads', label: 'Ads', desc: 'Manage ad slots and ad codes', group: 'Panel' },
  { key: 'lounges', label: 'Lounges', desc: 'Create, edit and delete any lounge', group: 'Panel' },
  { key: 'personas', label: 'AI personas', desc: 'Switch personas on or off and choose who can DM them', group: 'Panel' },
  { key: 'staff', label: 'Staff & permissions', desc: 'Make people moderators and give them permissions', group: 'Panel' },
];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export const ROLE_DEFAULTS = {
  admin: PERMISSION_KEYS,
  mod: ['overview', 'reports', 'mute'],
  user: [],
};
export const ROLES = [
  { key: 'user', label: 'Member' },
  { key: 'mod', label: 'Moderator' },
  { key: 'admin', label: 'Admin' },
];

/** Every permission someone holds: their role's defaults plus anything granted to them. */
export function permissionsOf(u) {
  if (!u) return [];
  const role = u.role ?? 'user';
  if (role === 'admin') return [...PERMISSION_KEYS];
  return [...new Set([...(ROLE_DEFAULTS[role] ?? []), ...(u.perms ?? []).filter((p) => PERMISSION_KEYS.includes(p))])];
}
export const can = (u, perm) => permissionsOf(u).includes(perm);
export const isStaff = (u) => permissionsOf(u).length > 0;
