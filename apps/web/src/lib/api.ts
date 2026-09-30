import { createApi } from '@chatlol/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? '';
const KEY = 'chatlol.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } },
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export const api = createApi({ baseUrl: API_URL || window.location.origin, getToken: tokenStore.get, onUnauthorized: () => onUnauthorized() });

export async function uploadImage(file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await api.upload(form)).url;
}
