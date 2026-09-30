import { ref, watchEffect } from 'vue';

type Mode = 'system' | 'light' | 'dark';
const KEY = 'chatlol.theme';
const read = (): Mode => { try { return (localStorage.getItem(KEY) as Mode) || 'system'; } catch { return 'system'; } };
export const themeMode = ref<Mode>(read());
const mq = matchMedia('(prefers-color-scheme: dark)');
const apply = () => {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1a110c' : '#ff5e00');
};
mq.addEventListener('change', apply);
watchEffect(() => {
  apply();
  try { localStorage.setItem(KEY, themeMode.value); } catch { /* ignore */ }
});
