import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createApi } from '@chatlol/shared';
import { session } from './store';

const KEY = 'chatlol.token';

/** API base URL: EXPO_PUBLIC_API_URL > app.json extra.apiUrl > desktop-provided URL. */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof window !== 'undefined' ? (window as { chatlolDesktop?: { apiUrl?: string } }).chatlolDesktop?.apiUrl : undefined) ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:4000';

export const tokenStore = {
  async load() {
    if (Platform.OS === 'web') { try { return localStorage.getItem(KEY); } catch { return null; } }
    return SecureStore.getItemAsync(KEY);
  },
  async save(t: string | null) {
    session.set({ token: t });
    if (Platform.OS === 'web') { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* ignore */ } return; }
    if (t) await SecureStore.setItemAsync(KEY, t);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

export const api = createApi({
  baseUrl: API_URL,
  getToken: () => session.get().token,
  onUnauthorized: () => { if (session.get().user) void import('./actions').then((m) => m.logout()); },
});

/** Uploads a local file URI (from the image picker / camera) to the API. */
export async function uploadUri(uri: string, mime = 'image/jpeg') {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob, `upload.${blob.type.split('/')[1] ?? 'jpg'}`);
  } else {
    const name = uri.split('/').pop() ?? 'upload.jpg';
    form.append('file', { uri, name, type: mime } as unknown as Blob);
  }
  return (await api.upload(form)).url;
}
