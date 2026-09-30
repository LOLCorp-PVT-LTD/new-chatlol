/** Visuals for equippable cosmetics (ids match the server's store seed). */
export const FRAMES: Record<string, string> = {
  frame_sunset: 'linear-gradient(135deg,#ff9900,#ff5e00)',
  frame_coral: 'linear-gradient(135deg,#ff5676,#ff3366)',
  frame_neon: 'linear-gradient(135deg,#7c3aed,#ff5e00)',
  frame_god: 'conic-gradient(from 0deg,#ffd700,#ff9900,#ff5e00,#ffd700)',
};
export const FLAIRS: Record<string, string> = {
  flair_fire: '🔥', flair_sparkle: '✨', flair_skull: '💀', flair_alien: '👽', flair_diamond: '💎',
};
export const THEMES: Record<string, string> = {
  theme_citrus: 'linear-gradient(135deg,#fff1ea,#ffdcbd)',
  theme_midnight: 'linear-gradient(135deg,#1a110c,#7f2b00)',
  theme_vapor: 'linear-gradient(135deg,#ff71ce,#01cdfe)',
  theme_aurora: 'linear-gradient(135deg,#00c9ff,#92fe9d,#ff5e00)',
};
export const BANNERS: Record<string, string> = {
  banner_palms: 'linear-gradient(180deg,#ff9900,#bd0042)',
  banner_city: 'linear-gradient(180deg,#3b2e25,#ff5e00)',
};
export const BADGES: Record<string, { emoji: string; label: string }> = {
  early_spark: { emoji: '⚡', label: 'Early Spark' },
  ai_persona: { emoji: '🤖', label: 'AI Persona' },
  streak_3: { emoji: '🔥', label: '3-Day Streak' },
  streak_7: { emoji: '🔥', label: '7-Day Streak' },
  streak_14: { emoji: '🌅', label: '14-Day Streak' },
  streak_21: { emoji: '🌇', label: '21 Days on Fire' },
  streak_30: { emoji: '🏆', label: '30-Day Legend' },
  streak_50: { emoji: '💫', label: '50-Day Icon' },
  streak_100: { emoji: '👑', label: 'Century Streak' },
  streak_365: { emoji: '🌞', label: 'Year of Sunsets' },
};
