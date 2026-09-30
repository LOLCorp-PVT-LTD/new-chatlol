export interface NavItem { to: string; label: string; icon: string; badge?: 'dms' | 'live' }
export const NAV: NavItem[] = [
  { to: '/', label: 'The Stream Feed', icon: 'whatshot' },
  { to: '/drops', label: 'Daily Sunset Drops', icon: 'wb_twilight' },
  { to: '/roulette', label: 'Vibe Roulette', icon: 'casino' },
  { to: '/arena', label: 'Hot Take Arena', icon: 'swords' },
  { to: '/lounges', label: 'Hangout Lounges', icon: 'forum', badge: 'live' },
  { to: '/live', label: 'Live Streams', icon: 'live_tv' },
  { to: '/messages', label: 'Messages', icon: 'mail', badge: 'dms' },
  { to: '/shouts', label: 'Shouts Board', icon: 'campaign' },
  { to: '/members', label: 'Browse Members', icon: 'group' },
  { to: '/leaderboard', label: 'Hall of Fame', icon: 'emoji_events' },
  { to: '/vault', label: 'Sparks Vault', icon: 'diamond' },
];
export const TABS: NavItem[] = [
  { to: '/', label: 'Stream', icon: 'whatshot' },
  { to: '/roulette', label: 'Vibe', icon: 'casino' },
  { to: '/drops', label: 'Drops', icon: 'wb_twilight' },
  { to: '/arena', label: 'Arena', icon: 'swords' },
  { to: '/lounges', label: 'Lounges', icon: 'forum' },
];
