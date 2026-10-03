import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import 'iconsax-font-icon/dist/icons.css';
import './assets/main.css';
import './stores/theme';

createApp(App).use(createPinia()).use(router).mount('#app');

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // A tapped push notification opens its page in the tab that's already open.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.link === 'string') void router.push(e.data.link);
  });
}
