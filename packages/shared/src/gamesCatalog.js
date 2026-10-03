/**
 * Games for the profile "Games I play" section. Steam games come from Steam's store search (logo = the game's
 * Steam capsule image); these are popular games that aren't on Steam (console, mobile, launchers), shown with a
 * colour tile and emoji. Ids: `steam:<appid>` or `x:<key>`.
 */
export const EXTRA_GAMES = [
  ['fortnite', 'Fortnite', '🪂', '#5b2be0'], ['valorant', 'Valorant', '🎯', '#ff4655'], ['lol', 'League of Legends', '⚔️', '#c89b3c'],
  ['minecraft', 'Minecraft', '⛏️', '#5b8731'], ['roblox', 'Roblox', '🧱', '#e2231a'], ['genshin', 'Genshin Impact', '✨', '#4a6fa5'],
  ['clashroyale', 'Clash Royale', '👑', '#2a7bd4'], ['clashofclans', 'Clash of Clans', '🏰', '#f0a30a'], ['brawlstars', 'Brawl Stars', '⭐', '#ffcd00'],
  ['pubgm', 'PUBG Mobile', '🪖', '#f2a900'], ['freefire', 'Free Fire', '🔥', '#ff6a00'], ['codm', 'Call of Duty: Mobile', '🎖️', '#3d3d3d'],
  ['warzone', 'Call of Duty: Warzone', '🪖', '#1f2a1f'], ['mlbb', 'Mobile Legends: Bang Bang', '🛡️', '#1d4ed8'], ['pokemongo', 'Pokémon GO', '🔴', '#e3350d'],
  ['pokemon', 'Pokémon Scarlet & Violet', '⚡', '#f7d02c'], ['zelda', 'The Legend of Zelda: Tears of the Kingdom', '🗡️', '#2e7d32'],
  ['mariokart', 'Mario Kart 8 Deluxe', '🏎️', '#e60012'], ['smash', 'Super Smash Bros. Ultimate', '💥', '#a50000'], ['animalcrossing', 'Animal Crossing', '🍃', '#6abf4b'],
  ['candycrush', 'Candy Crush Saga', '🍬', '#e91e63'], ['subway', 'Subway Surfers', '🛹', '#f4b400'], ['chess', 'Chess.com', '♟️', '#769656'],
  ['wow', 'World of Warcraft', '🐉', '#0b4f8a'], ['overwatch', 'Overwatch 2', '🦸', '#f99e1a'], ['hearthstone', 'Hearthstone', '🃏', '#c08a3e'],
  ['diablo4', 'Diablo IV', '😈', '#7a0b0b'], ['fifa', 'EA SPORTS FC', '⚽', '#0b8a3d'], ['gta6', 'Grand Theft Auto VI', '🌴', '#ff3d7f'],
  ['valorantmobile', 'Honor of Kings', '🏯', '#b8860b'], ['wildrift', 'League of Legends: Wild Rift', '📱', '#1e88e5'], ['stumble', 'Stumble Guys', '🤸', '#ffb300'],
  ['amongus', 'Among Us', '🧑‍🚀', '#c51111'], ['fallguys', 'Fall Guys', '🫘', '#ff66c4'], ['rocketleague', 'Rocket League', '🚗', '#0d47a1'],
  ['apex', 'Apex Legends', '🦾', '#da292a'], ['halo', 'Halo Infinite', '🪖', '#37474f'], ['spiderman', 'Marvel’s Spider-Man 2', '🕷️', '#c62828'],
  ['godofwar', 'God of War Ragnarök', '🪓', '#8d6e63'], ['lastofus', 'The Last of Us', '🍄', '#4e5d3a'], ['sims4', 'The Sims 4', '💎', '#2bb24c'],
].map(([key, name, emoji, color]) => ({ id: `x:${key}`, name, logo: null, emoji, color }));

/** A game as stored on a profile. */
export const gameFromSteam = (appid, name) => ({ id: `steam:${appid}`, name: String(name).slice(0, 80), logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`, emoji: null, color: null });
export const MAX_PROFILE_GAMES = 24;

/** Cleans a submitted games list: Steam ids are rebuilt from the id, others must be in EXTRA_GAMES. */
export function cleanGames(list) {
  const out = [];
  for (const g of Array.isArray(list) ? list : []) {
    const id = String(g?.id ?? '');
    let v = null;
    const m = id.match(/^steam:(\d{1,10})$/);
    if (m) v = gameFromSteam(m[1], String(g.name ?? '').trim() || 'Steam game');
    else v = EXTRA_GAMES.find((x) => x.id === id) ?? null;
    if (v && !out.some((o) => o.id === v.id)) out.push(v);
    if (out.length >= MAX_PROFILE_GAMES) break;
  }
  return out;
}
