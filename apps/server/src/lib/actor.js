import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who is acting in the current request (set by requireAuth). Lets moderation helpers that don't receive `req`
 * (like assertClean) know when an admin is acting — admins are never moderated.
 */
export const actorStore = new AsyncLocalStorage();
export const actingAdmin = () => actorStore.getStore()?.role === 'admin';
