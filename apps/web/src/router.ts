import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSession } from './stores/session';

declare module 'vue-router' {
  interface RouteMeta { layout?: 'bare' | 'app'; rails?: boolean; auth?: boolean; title?: string }
}

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('./views/FeedView.vue'), meta: { title: 'The Stream' } },
  { path: '/welcome', component: () => import('./views/LandingView.vue'), meta: { layout: 'bare' } },
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { layout: 'bare', title: 'Log in' } },
  { path: '/join', component: () => import('./views/RegisterView.vue'), meta: { layout: 'bare', title: 'Join' } },
  { path: '/drops', component: () => import('./views/DropsView.vue'), meta: { title: 'Sunset Drops' } },
  { path: '/roulette', component: () => import('./views/RouletteView.vue'), meta: { auth: true, title: 'Vibe Roulette' } },
  { path: '/arena', component: () => import('./views/ArenaView.vue'), meta: { title: 'Hot Take Arena' } },
  { path: '/shouts', component: () => import('./views/ShoutsView.vue'), meta: { title: 'Shouts' } },
  { path: '/shouts/:id', component: () => import('./views/ThreadView.vue'), meta: { title: 'Shout' } },
  { path: '/lounges', component: () => import('./views/LoungesView.vue'), meta: { title: 'Lounges' } },
  { path: '/lounges/:id', component: () => import('./views/LoungeRoomView.vue'), meta: { rails: false, title: 'Lounge' } },
  { path: '/live', component: () => import('./views/LiveView.vue'), meta: { title: 'Live' } },
  { path: '/live/:id', component: () => import('./views/LiveRoomView.vue'), meta: { rails: false, title: 'Live' } },
  { path: '/messages/:id?', component: () => import('./views/MessagesView.vue'), meta: { auth: true, rails: false, title: 'Messages' } },
  { path: '/members', component: () => import('./views/MembersView.vue'), meta: { title: 'Members' } },
  { path: '/leaderboard', component: () => import('./views/LeaderboardView.vue'), meta: { title: 'Hall of Fame' } },
  { path: '/vault', component: () => import('./views/VaultView.vue'), meta: { title: 'Sparks Vault' } },
  { path: '/locker', component: () => import('./views/ProfileView.vue'), meta: { auth: true, title: 'My Locker' } },
  { path: '/u/:handle', component: () => import('./views/ProfileView.vue'), meta: { title: 'Profile' } },
  { path: '/p/:id', component: () => import('./views/PostView.vue'), meta: { title: 'Post' } },
  { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { auth: true, title: 'Settings' } },
  { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});

router.beforeEach(async (to) => {
  const s = useSession();
  if (!s.ready) await s.boot();
  if (to.path === '/' && !s.isAuthed && !to.query.tag) return '/welcome';
  if (to.meta.auth && !s.isAuthed) return { path: '/login', query: { next: to.fullPath } };
  if ((to.path === '/login' || to.path === '/join' || to.path === '/welcome') && s.isAuthed) return '/';
});
router.afterEach((to) => { document.title = to.meta.title ? `${to.meta.title} • ChatLOL` : 'ChatLOL'; });
