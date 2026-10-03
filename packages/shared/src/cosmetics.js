/**
 * Shop cosmetics for profiles: designed covers, profile button styles and extra fonts. Every one is a Vault item
 * (key = item key) bought with Sparks or Gems, and the rarer ones with Gold too (`gold`). Covers and buttons are
 * equipped (cosmetics.cover / cosmetics.button); fonts are picked in the profile builder once owned.
 */
const R = (price, rarity, gold = null) => ({ price, rarity, gold });

export const PROFILE_COVERS = [
  { key: 'cover_golden_dunes', label: 'Golden Dunes', ...R(300, 'common'), css: 'radial-gradient(120% 80% at 80% 110%, #b84a00 0 30%, transparent 31%), radial-gradient(140% 90% at 10% 120%, #e06a00 0 35%, transparent 36%), radial-gradient(circle at 70% 30%, #fff3b0 0 8%, transparent 9%), linear-gradient(180deg, #ffb347, #ff7a18 60%, #b84a00)' },
  { key: 'cover_synthwave', label: 'Synthwave Sun', ...R(600, 'rare'), css: 'repeating-linear-gradient(0deg, transparent 0 14px, rgba(255,0,153,.55) 14px 16px) bottom/100% 45% no-repeat, repeating-linear-gradient(90deg, transparent 0 40px, rgba(255,0,153,.45) 40px 42px) bottom/100% 45% no-repeat, radial-gradient(circle at 50% 62%, #ffd319 0 16%, #ff2975 16.5% 22%, transparent 22.5%), linear-gradient(180deg, #1a0533, #8c1eff 70%, #2b0548)' },
  { key: 'cover_aurora', label: 'Aurora Night', ...R(900, 'epic', 1), css: 'radial-gradient(ellipse 60% 40% at 30% 40%, rgba(0,255,170,.55), transparent 70%), radial-gradient(ellipse 50% 35% at 70% 30%, rgba(120,90,255,.6), transparent 70%), radial-gradient(1px 1px at 20% 20%, #fff, transparent), radial-gradient(1px 1px at 80% 15%, #fff, transparent), radial-gradient(1px 1px at 55% 65%, #fff, transparent), linear-gradient(180deg, #020617, #0b1e3b)' },
  { key: 'cover_ocean', label: 'Ocean Waves', ...R(300, 'common'), css: 'radial-gradient(120% 60% at 50% 120%, #0c4a6e 0 40%, transparent 41%), radial-gradient(120% 60% at 20% 110%, #0369a1 0 40%, transparent 41%), radial-gradient(120% 60% at 80% 100%, #0ea5e9 0 38%, transparent 39%), linear-gradient(180deg, #e0f2fe, #7dd3fc)' },
  { key: 'cover_sakura', label: 'Sakura Bloom', ...R(500, 'rare'), css: 'radial-gradient(circle at 15% 30%, #fff 0 3%, transparent 3.5%), radial-gradient(circle at 75% 20%, #ffd1dc 0 4%, transparent 4.5%), radial-gradient(circle at 60% 70%, #fff 0 2.5%, transparent 3%), radial-gradient(circle at 35% 80%, #ffb7c5 0 3%, transparent 3.5%), radial-gradient(circle at 90% 60%, #ffe4ec 0 3%, transparent 3.5%), linear-gradient(135deg, #ffc6d9, #ff8fab 60%, #c9184a)' },
  { key: 'cover_lava', label: 'Molten Lava', ...R(800, 'epic', 1), css: 'radial-gradient(ellipse 30% 20% at 25% 70%, #ffd000, transparent 70%), radial-gradient(ellipse 25% 18% at 70% 55%, #ff6a00, transparent 70%), radial-gradient(ellipse 40% 25% at 50% 90%, #ff2a00, transparent 70%), linear-gradient(180deg, #1a0500, #4a0a00 50%, #8b1a00)' },
  { key: 'cover_matcha', label: 'Matcha Calm', ...R(250, 'common'), css: 'radial-gradient(circle at 80% 30%, rgba(255,255,255,.5) 0 12%, transparent 13%), repeating-radial-gradient(circle at 20% 120%, #a3c48a 0 12px, #b9d6a3 12px 24px)' },
  { key: 'cover_city_lights', label: 'City Lights', ...R(700, 'rare'), css: 'radial-gradient(2px 2px at 30% 78%, #ffd166, transparent), radial-gradient(2px 2px at 62% 84%, #ffd166, transparent), radial-gradient(2px 2px at 80% 74%, #ffd166, transparent), radial-gradient(2px 2px at 12% 86%, #ffd166, transparent), linear-gradient(90deg, #1b1b2f 0 8%, transparent 8% 11%, #23233a 11% 19%, transparent 19% 21%, #11111f 21% 33%, transparent 33% 35%, #1b1b2f 35% 47%, transparent 47% 50%, #23233a 50% 58%, transparent 58% 60%, #11111f 60% 74%, transparent 74% 76%, #1b1b2f 76% 88%, transparent 88% 90%, #23233a 90%) bottom/100% 55% no-repeat, linear-gradient(90deg, transparent 0 4%, #15152a 4% 14%, transparent 14% 26%, #15152a 26% 40%, transparent 40% 54%, #15152a 54% 66%, transparent 66% 80%, #15152a 80% 96%, transparent 96%) bottom/100% 72% no-repeat, linear-gradient(180deg, #2b1055, #d53a9d)' },
  { key: 'cover_holo', label: 'Holographic', ...R(1500, 'legendary', 2), css: 'linear-gradient(115deg, rgba(255,255,255,.35) 0 10%, transparent 30% 60%, rgba(255,255,255,.3) 75%, transparent 90%), conic-gradient(from 200deg at 50% 50%, #ff9a9e, #fad0c4, #a1c4fd, #c2e9fb, #d4fc79, #96e6a1, #ff9a9e)' },
  { key: 'cover_galaxy', label: 'Deep Galaxy', ...R(1200, 'legendary', 2), css: 'radial-gradient(ellipse 50% 30% at 50% 50%, rgba(255,120,200,.45), transparent 70%), radial-gradient(ellipse 30% 50% at 40% 45%, rgba(110,80,255,.45), transparent 70%), radial-gradient(1.5px 1.5px at 10% 30%, #fff, transparent), radial-gradient(1px 1px at 30% 80%, #fff, transparent), radial-gradient(1.5px 1.5px at 85% 25%, #fff, transparent), radial-gradient(1px 1px at 65% 85%, #fff, transparent), linear-gradient(180deg, #05010f, #140630)' },
  { key: 'cover_candy', label: 'Candy Stripes', ...R(350, 'common'), css: 'repeating-linear-gradient(45deg, #ff9ecd 0 22px, #fff0f7 22px 44px, #9ee7ff 44px 66px, #fff0f7 66px 88px)' },
  { key: 'cover_marble', label: 'Gold Marble', ...R(1000, 'epic', 1), css: 'radial-gradient(ellipse 80% 6% at 30% 40%, rgba(212,160,23,.8), transparent 70%), radial-gradient(ellipse 70% 4% at 70% 65%, rgba(212,160,23,.7), transparent 70%), radial-gradient(ellipse 60% 3% at 45% 85%, rgba(180,180,180,.6), transparent 70%), linear-gradient(135deg, #fafafa, #e9e6e1)' },
];

export const BUTTON_STYLES = [
  { key: 'btn_glass', label: 'Frosted Glass', ...R(300, 'common'), css: { background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.45)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(0,0,0,.15)' } },
  { key: 'btn_neon', label: 'Neon Glow', ...R(600, 'rare'), css: { background: '#0b0b14', color: '#39ff14', border: '1.5px solid #39ff14', boxShadow: '0 0 12px #39ff14, inset 0 0 8px rgba(57,255,20,.4)' } },
  { key: 'btn_gold', label: 'Royal Gold', ...R(1200, 'legendary', 2), css: { background: 'linear-gradient(180deg,#fff3b0,#fcd34d 45%,#d4a017)', color: '#3b2a00', border: '1px solid #b8860b', boxShadow: '0 6px 18px rgba(212,160,23,.45)' } },
  { key: 'btn_outline', label: 'Clean Outline', ...R(200, 'common'), css: { background: 'transparent', color: 'currentColor', border: '1.5px solid currentColor' } },
  { key: 'btn_pixel', label: 'Retro Pixel', ...R(500, 'rare'), css: { background: '#ffcc00', color: '#1b1b1b', border: '3px solid #1b1b1b', borderRadius: '0', boxShadow: '4px 4px 0 #1b1b1b', fontFamily: "'Press Start 2P', monospace", fontSize: '10px' } },
  { key: 'btn_sunset', label: 'Sunset Gradient', ...R(350, 'common'), css: { background: 'linear-gradient(135deg,#ff9900,#ff2e63)', color: '#fff', border: '0', boxShadow: '0 8px 20px rgba(255,46,99,.35)' } },
  { key: 'btn_chrome', label: 'Chrome', ...R(800, 'epic', 1), css: { background: 'linear-gradient(180deg,#fdfdfd,#c9ccd1 50%,#8e939b 51%,#e3e5e8)', color: '#1f2937', border: '1px solid #9ca3af', boxShadow: 'inset 0 1px 0 #fff' } },
  { key: 'btn_bubble', label: 'Bubblegum', ...R(400, 'rare'), css: { background: '#ff8fcf', color: '#fff', border: '0', boxShadow: 'inset 0 -4px 0 rgba(0,0,0,.15), 0 6px 14px rgba(255,143,207,.5)' } },
  { key: 'btn_holo', label: 'Holo Shift', ...R(1000, 'legendary', 2), css: { background: 'linear-gradient(120deg,#a1c4fd,#c2e9fb,#fbc2eb,#d4fc79)', color: '#1f2937', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 6px 18px rgba(161,196,253,.5)' } },
  { key: 'btn_midnight', label: 'Midnight', ...R(300, 'common'), css: { background: '#111827', color: '#f9fafb', border: '1px solid #374151' } },
];

/** Google Fonts loaded on demand. `family` is the Google Fonts family name. */
export const SHOP_FONTS = [
  { key: 'font_poppins', label: 'Poppins', family: 'Poppins', css: "'Poppins', sans-serif", ...R(200, 'common') },
  { key: 'font_montserrat', label: 'Montserrat', family: 'Montserrat', css: "'Montserrat', sans-serif", ...R(200, 'common') },
  { key: 'font_space', label: 'Space Grotesk', family: 'Space Grotesk', css: "'Space Grotesk', sans-serif", ...R(250, 'common') },
  { key: 'font_comfortaa', label: 'Comfortaa', family: 'Comfortaa', css: "'Comfortaa', sans-serif", ...R(250, 'common') },
  { key: 'font_playfair', label: 'Playfair', family: 'Playfair Display', css: "'Playfair Display', serif", ...R(400, 'rare') },
  { key: 'font_bebas', label: 'Bebas Neue', family: 'Bebas Neue', css: "'Bebas Neue', sans-serif", ...R(400, 'rare') },
  { key: 'font_righteous', label: 'Righteous', family: 'Righteous', css: "'Righteous', sans-serif", ...R(400, 'rare') },
  { key: 'font_caveat', label: 'Caveat', family: 'Caveat', css: "'Caveat', cursive", ...R(400, 'rare') },
  { key: 'font_anton', label: 'Anton', family: 'Anton', css: "'Anton', sans-serif", ...R(450, 'rare') },
  { key: 'font_orbitron', label: 'Orbitron', family: 'Orbitron', css: "'Orbitron', sans-serif", ...R(700, 'epic', 1) },
  { key: 'font_pacifico', label: 'Pacifico', family: 'Pacifico', css: "'Pacifico', cursive", ...R(700, 'epic', 1) },
  { key: 'font_lobster', label: 'Lobster', family: 'Lobster', css: "'Lobster', cursive", ...R(700, 'epic', 1) },
  { key: 'font_dancing', label: 'Dancing Script', family: 'Dancing Script', css: "'Dancing Script', cursive", ...R(700, 'epic', 1) },
  { key: 'font_pixel', label: 'Press Start', family: 'Press Start 2P', css: "'Press Start 2P', monospace", ...R(1000, 'legendary', 2) },
];

export const coverByKey = (k) => PROFILE_COVERS.find((c) => c.key === k);
export const buttonStyleByKey = (k) => BUTTON_STYLES.find((c) => c.key === k);
export const shopFontByKey = (k) => SHOP_FONTS.find((c) => c.key === k);
/** Google Fonts stylesheet URL for one family. */
export const googleFontUrl = (family) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600&display=swap`;

/**
 * Animated avatar frames (Vault → Frames). `fx` names the CSS animation the apps draw; `css` is a still fallback
 * (and the shop tile). `orbit` adds little emoji circling the avatar. `gold` = can also be bought with Gold.
 */
export const ANIMATED_FRAMES = [
  { key: 'frame_rainbow', label: 'Rainbow Spin', emoji: '🌈', desc: 'A full-spectrum ring that never stops turning', ...R(800, 'rare'), fx: 'rainbow', css: 'conic-gradient(#ff004c,#ff9900,#ffe600,#33e07a,#00c2ff,#8a5cff,#ff004c)' },
  { key: 'frame_frost', label: 'Frostbite', emoji: '❄️', desc: 'Ice-blue ring with a frosty shine sweeping round', ...R(700, 'rare'), fx: 'frost', css: 'linear-gradient(120deg,#a5f3fc,#ffffff,#38bdf8)' },
  { key: 'frame_neon_pulse', label: 'Neon Pulse', emoji: '💡', desc: 'Pink and cyan neon that breathes', ...R(900, 'rare'), fx: 'neon', css: 'linear-gradient(135deg,#ff2bd6,#00e5ff)' },
  { key: 'frame_heartbeat', label: 'Heartbeat', emoji: '💓', desc: 'A ring that beats like a heart', ...R(650, 'rare'), fx: 'heartbeat', css: 'linear-gradient(135deg,#ff4d8d,#ff1f5a)' },
  { key: 'frame_inferno', label: 'Inferno', emoji: '🔥', desc: 'Spinning flames with a flickering glow', ...R(1500, 'epic'), fx: 'inferno', css: 'conic-gradient(#ff2a00,#ff9900,#ffd000,#ff4d00,#ff2a00)' },
  { key: 'frame_galaxy', label: 'Galaxy', emoji: '🌌', desc: 'A slow-turning galaxy of violet and pink', ...R(1800, 'epic'), fx: 'galaxy', css: 'conic-gradient(#1e0b4b,#6d28d9,#ec4899,#1e3a8a,#1e0b4b)' },
  { key: 'frame_thunder', label: 'Thunderstruck', emoji: '⚡', desc: 'Electric hazard ring with lightning flashes', ...R(1600, 'epic'), fx: 'thunder', css: 'repeating-conic-gradient(#fde047 0 10deg,#1e1b4b 10deg 20deg)' },
  { key: 'frame_glitch', label: 'Glitch', emoji: '👾', desc: 'RGB-split ring that glitches out', ...R(1500, 'epic'), fx: 'glitch', css: 'linear-gradient(135deg,#00ff9c,#00b3ff,#ff00e6)' },
  { key: 'frame_sakura', label: 'Sakura Drift', emoji: '🌸', desc: 'Blossom pink ring with petals circling', ...R(1400, 'epic'), fx: 'sakura', orbit: '🌸', css: 'linear-gradient(135deg,#ffc0d9,#ff7eb3)' },
  { key: 'frame_gilded', label: 'Gilded', emoji: '✨', desc: 'Polished gold with a shine that runs round', ...R(2400, 'legendary', 1), fx: 'gilded', css: 'linear-gradient(110deg,#b8860b,#fcd34d,#fffbe6,#fcd34d,#b8860b)' },
  { key: 'frame_hologram', label: 'Hologram', emoji: '🪩', desc: 'Iridescent, colour-shifting holo ring', ...R(2800, 'legendary', 2), fx: 'holo', css: 'linear-gradient(135deg,#ff9ad5,#a5b4fc,#67e8f9,#bbf7d0,#fde68a)' },
  { key: 'frame_orbit', label: 'Star Orbit', emoji: '💫', desc: 'Midnight ring with golden stars in orbit', ...R(3200, 'legendary', 3), fx: 'orbit', orbit: '✦', css: 'conic-gradient(#0f172a,#334155,#fcd34d,#0f172a)' },
];
export const animatedFrameByKey = (k) => ANIMATED_FRAMES.find((f) => f.key === k) ?? null;

/** More name flairs (the emoji after your name). */
export const EXTRA_FLAIRS = [
  { key: 'flair_rocket', label: 'To The Moon', emoji: '🚀', ...R(250, 'common') },
  { key: 'flair_ghost', label: 'Ghosted', emoji: '👻', ...R(250, 'common') },
  { key: 'flair_rainbow', label: 'Good Vibes', emoji: '🌈', ...R(400, 'rare') },
  { key: 'flair_lightning', label: 'Lightning', emoji: '⚡', ...R(400, 'rare') },
  { key: 'flair_crown', label: 'Royal', emoji: '👑', ...R(1200, 'epic') },
  { key: 'flair_unicorn', label: 'Unicorn', emoji: '🦄', ...R(1500, 'epic') },
  { key: 'flair_dragon', label: 'Dragon', emoji: '🐉', ...R(2500, 'legendary', 1) },
];
