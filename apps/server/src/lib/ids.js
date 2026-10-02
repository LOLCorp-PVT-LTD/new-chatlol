import { stableId } from '../db.js';

/**
 * Fixed ObjectIds for built-in records, derived from their names: every install and every seed run gives the
 * same board, lounge, store item, persona and demo account the same id, so references to them never drift.
 * The readable name lives in its own field (slug / key / personaId).
 */
export const boardIdFor = (slug) => stableId(`board:${slug}`);
export const loungeIdFor = (slug) => stableId(`lounge:${slug}`);
export const itemIdFor = (key) => stableId(`item:${key}`);
export const personaUserId = (personaId) => stableId(`persona:${personaId}`);
export const DEMO_USER_ID = stableId('user:demo');
