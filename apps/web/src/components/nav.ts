export interface NavItem { to: string; label: string; icon: string; badge?: 'dms' | 'live' }
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/feed', label: 'News Feed', icon: 'dynamic_feed' },
  { to: '/shouts', label: 'Shoutbox', icon: 'campaign', badge: 'live' },
  { to: '/roulette', label: 'Rate & Meet', icon: 'casino' },
  { to: '/members', label: 'Browse Members', icon: 'group' },
  { to: '/friends', label: 'Friends', icon: 'diversity_3' },
  { to: '/messages', label: 'Messages', icon: 'mail', badge: 'dms' },
  { to: '/lounges', label: 'Hangout Lounges', icon: 'forum' },
  { to: '/forums', label: 'Forums', icon: 'groups' },
  { to: '/live', label: 'Live Streams', icon: 'live_tv' },
  { to: '/drops', label: 'Daily Sunset Drops', icon: 'wb_twilight' },
  { to: '/games', label: 'Game Arenas', icon: 'sports_esports' },
  { to: '/arena', label: 'Hot Take Arena', icon: 'swords' },
  { to: '/leaderboard', label: 'Hall of Fame', icon: 'emoji_events' },
  { to: '/insights', label: 'Who Viewed Me', icon: 'visibility' },
  { to: '/premium', label: 'Premium', icon: 'workspace_premium' },
  { to: '/vault', label: 'Sparks Vault', icon: 'diamond' },
  { to: '/invite', label: 'Invite & earn Gold', icon: 'person_add' },
];
export const TABS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/feed', label: 'Feed', icon: 'dynamic_feed' },
  { to: '/shouts', label: 'Shouts', icon: 'campaign' },
  { to: '/roulette', label: 'Rate', icon: 'casino' },
  { to: '/messages', label: 'DMs', icon: 'mail' },
];
