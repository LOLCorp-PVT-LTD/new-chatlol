import { db, newId, now, today, initDb, type Row } from './db';
import { PERSONAS } from './ai/personas';
import { DEFAULT_SETTINGS } from './lib/serialize';
import { hashPassword } from './lib/auth';
import { ensureDrop } from './lib/drops';

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const ahead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const BOARDS = [
  ['daily', 'Daily Vibes', '☀️'], ['hottakes', 'Hot Takes', '🌶️'], ['fits', 'Fit Check', '👟'], ['gaming', 'Gaming', '🎮'],
  ['music', 'Music & Beats', '🎧'], ['food', 'Food Crew', '🍜'], ['creative', 'Creative Corner', '🎨'], ['tech', 'Tech & Setups', '💻'],
  ['travel', 'Travel', '✈️'], ['fitness', 'Fitness', '💪'], ['outdoors', 'Outdoors', '⛰️'], ['movies', 'Movies & TV', '🍿'],
  ['sports', 'Sports', '🏀'], ['anime', 'Anime', '🌸'],
];

const LOUNGES = [
  ['golden-rooftop', 'Golden Hour Rooftop', '🌇', 'Sunset chill & good convo', 'Tame Impala — The Less I Know The Better', 'https://picsum.photos/seed/rooftop/800/500'],
  ['lofi-cafe', 'Lo-Fi Cafe Lounge', '☕', 'Study, work, vibe', 'lofi girl — beats to relax/study to', 'https://picsum.photos/seed/lofi/800/500'],
  ['late-night-beats', 'Late Night Chill Beats', '🌙', 'For the 2AM crowd', 'Tycho — Awake', 'https://picsum.photos/seed/latenight/800/500'],
  ['setup-clashes', 'Desk Setup Clashes', '🖥️', 'Show your battlestation', 'Daft Punk — Digital Love', 'https://picsum.photos/seed/desk/800/500'],
  ['skate-sunset', 'Skate & Sunset Fits', '🛹', 'Fits, tricks, and golden hour', 'Mac DeMarco — Chamber of Reflection', 'https://picsum.photos/seed/skate/800/500'],
  ['hot-takes-hq', 'Hot Takes HQ', '🌶️', 'Debate club but make it fun', 'Kendrick Lamar — Not Like Us', 'https://picsum.photos/seed/hottakes/800/500'],
];

type SeedItem = [id: string, kind: string, name: string, desc: string, price: number, rarity: string, emoji: string, preview: string, limited?: number];
const STORE: SeedItem[] = [
  ['frame_sunset', 'frame', 'Sunset Halo', 'Warm gradient avatar ring', 150, 'common', '🌅', 'linear-gradient(135deg,#ff9900,#ff5e00)'],
  ['frame_coral', 'frame', 'Coral Pulse', 'Animated coral glow ring', 400, 'rare', '💗', 'linear-gradient(135deg,#ff5676,#ff3366)'],
  ['frame_neon', 'frame', 'Neon Night', 'Electric purple-to-orange ring', 900, 'epic', '🌆', 'linear-gradient(135deg,#7c3aed,#ff5e00)'],
  ['frame_god', 'frame', 'God Tier Crown', 'Golden animated crown ring — legends only', 2500, 'legendary', '👑', 'linear-gradient(135deg,#ffd700,#ff9900,#ff5e00)', 1],
  ['flair_fire', 'flair', 'On Fire', '🔥 next to your name', 120, 'common', '🔥', '#ff5e00'],
  ['flair_sparkle', 'flair', 'Sparkle', '✨ next to your name', 120, 'common', '✨', '#fe9800'],
  ['flair_skull', 'flair', 'I’m Dead', '💀 next to your name', 300, 'rare', '💀', '#3b2e25'],
  ['flair_alien', 'flair', 'Not From Here', '👽 next to your name', 700, 'epic', '👽', '#22c55e'],
  ['flair_diamond', 'flair', 'Diamond Hands', '💎 next to your name', 1800, 'legendary', '💎', '#38bdf8'],
  ['theme_citrus', 'theme', 'Citrus Pop', 'Bright tangerine profile theme', 250, 'common', '🍊', 'linear-gradient(135deg,#fff1ea,#ffdcbd)'],
  ['theme_midnight', 'theme', 'Midnight Sunset', 'Dark dusk profile theme', 600, 'rare', '🌌', 'linear-gradient(135deg,#1a110c,#7f2b00)'],
  ['theme_vapor', 'theme', 'Vaporwave', 'Retro pink & teal profile', 1100, 'epic', '📼', 'linear-gradient(135deg,#ff71ce,#01cdfe)'],
  ['theme_aurora', 'theme', 'Aurora', 'Animated northern lights profile', 2200, 'legendary', '🌈', 'linear-gradient(135deg,#00c9ff,#92fe9d,#ff5e00)', 1],
  ['banner_palms', 'banner', 'Palm Silhouettes', 'Profile banner', 200, 'common', '🌴', 'linear-gradient(180deg,#ff9900,#bd0042)'],
  ['banner_city', 'banner', 'City Lights', 'Profile banner', 500, 'rare', '🏙️', 'linear-gradient(180deg,#3b2e25,#ff5e00)'],
  ['crate_sunset', 'crate', 'Sunset Loot Crate', 'A random cosmetic. Odds: 62% common, 27% rare, 9% epic, 2% legendary', 300, 'rare', '🎁', 'linear-gradient(135deg,#ff9900,#bd0042)'],
  ['streak_freeze', 'streak_freeze', 'Streak Freeze', 'Miss a day without losing your Sunset streak', 200, 'common', '🧊', 'linear-gradient(135deg,#bae6fd,#38bdf8)'],
  ['boost_2x', 'boost', '2x Vibe Boost', 'Double roulette Sparks for 1 hour', 350, 'rare', '⚡', 'linear-gradient(135deg,#fde047,#ff9900)'],
];

const TAKES: [string, string, number, number][] = [
  ['GAMING', 'Competitive FPS games were 100x better before SBMM', 1264, 630],
  ['MUSIC', 'Physical media (vinyl & cassettes) sounds noticeably warmer & worth every dollar', 720, 520],
  ['STREETWEAR', 'Oversized baggy 90s skater silhouettes will remain dominant for another decade', 700, 258],
  ['LIFESTYLE', 'Late night 2 AM flow state productivity hits harder than 6 AM routines', 1470, 940],
  ['FOOD', 'Thin crisp Neapolitan crust completely clears thick Detroit deep dish any day', 1620, 1495],
  ['TECH', 'Tabs are objectively better than spaces', 410, 388],
];

const SEED_CAPTIONS = [
  'golden hour dump 📸 #goldenhour', 'new setup who dis #setupwars', 'fit check before the rooftop thing #fitscheck',
  'this light >>> #goldenhour', 'sunday reset complete ✨', 'caught the sky doing its thing #goldenhour', 'lo-fi and coffee kind of morning #lofi',
  'weekend mood board #thrifted', 'the view from my walk home', 'finally finished this one 🎨', 'rate honestly I can take it 😅',
  'tiny moments > big plans', 'late night flow state #setupwars', 'thrift haul was elite today #thrifted',
];

export async function seed(reset = false) {
  if (reset) {
    for (const t of ['email_tokens', 'purchases', 'daily_counters', 'reports', 'push_tokens', 'stream_gifts', 'streams', 'inventory', 'store_items', 'notifications', 'messages',
      'conversation_members', 'conversations', 'lounges', 'replies', 'thread_votes', 'threads', 'boards', 'stakes', 'hot_takes', 'drops', 'comments',
      'reactions', 'ratings', 'battle_votes', 'battle_options', 'posts', 'blocks', 'follows', 'users']) await db.run(`DELETE FROM ${t}`);
  }
  const t = now();
  for (const [i, [id, name, emoji]] of BOARDS.entries()) await db.run('INSERT INTO boards (id, name, emoji, position) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', id, name, emoji, i);
  for (const [i, [id, name, emoji, topic, np, cover]] of LOUNGES.entries()) {
    await db.run('INSERT INTO lounges (id, name, emoji, topic, now_playing, cover_url, position) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', id, name, emoji, topic, np, cover, i);
  }
  for (const [i, [id, kind, name, desc, price, rarity, emoji, preview, limited]] of STORE.entries()) {
    await db.run('INSERT INTO store_items (id, kind, name, description, price, rarity, emoji, preview, limited, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      id, kind, name, desc, price, rarity, emoji, preview, limited ?? 0, i);
  }

  // AI personas as users — always flagged is_ai = 1 (shown as an AI badge in every client).
  const personaIds: string[] = [];
  for (const p of PERSONAS) {
    const id = `ai_${p.id}`;
    personaIds.push(id);
    const born = `${new Date().getFullYear() - p.age}-0${1 + (p.age % 9)}-1${p.age % 9}`;
    await db.run(
      `INSERT INTO users (id, handle, display_name, avatar_url, bio, pronouns, city, birthdate, interests, xp, sparks, streak_days, last_drop_day, badges, settings, is_ai, persona_id, last_seen_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT DO NOTHING`,
      id, p.handle, p.displayName, `https://i.pravatar.cc/300?img=${p.avatarSeed}`, p.bio, p.pronouns, p.city, born, JSON.stringify(p.interests),
      Math.floor(2000 + Math.random() * 40000), 800, Math.floor(3 + Math.random() * 40), today(new Date(Date.now() - 86_400_000)),
      JSON.stringify(['ai_persona']), JSON.stringify(DEFAULT_SETTINGS), p.id, t, ago(24 * 60));
  }

  // Demo human account so you can log straight in.
  if (!(await db.one("SELECT 1 AS x FROM users WHERE id = 'u_demo'"))) {
    await db.run(
      `INSERT INTO users (id, email, password_hash, handle, display_name, avatar_url, bio, pronouns, city, birthdate, interests, xp, sparks, gems, streak_days, last_drop_day, badges, settings, email_verified_at, last_seen_at, created_at)
       VALUES (?, 'demo@chatlol.app', ?, 'jordan_vibe', 'Jordan Vance', 'https://i.pravatar.cc/300?img=11', 'photographer + lo-fi beatmaker 🎧 golden hour chaser', 'he/they', 'Seattle, WA', '2001-05-14', ?, 14200, 1420, 120, 21, ?, ?, ?, ?, ?, ?)`,
      'u_demo', await hashPassword('sunset123'), JSON.stringify(['photography', 'lofi', 'filmcamera', 'thrifted']),
      today(new Date(Date.now() - 86_400_000)), JSON.stringify(['early_spark', 'streak_7', 'streak_14', 'streak_21']), JSON.stringify(DEFAULT_SETTINGS), t, t, ago(24 * 90));
  }
  const everyone = [...personaIds, 'u_demo'];
  for (const a of everyone) for (const b of everyone) {
    if (a !== b && Math.random() < 0.45) await db.run('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', a, b, t);
  }

  await db.tx(async () => {
    // Seed posts
    const drop = await ensureDrop();
    const postIds: string[] = [];
    for (let i = 0; i < 48; i++) {
      const author = pick(personaIds);
      const id = newId('p');
      const isDrop = i < 10;
      const created = isDrop ? ago(Math.random() * 10) : ago(Math.random() * 60);
      const body = pick(SEED_CAPTIONS);
      await db.run(
        'INSERT INTO posts (id, author_id, kind, body, media_url, tags, drop_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, author, isDrop ? 'drop' : 'photo', body, `https://picsum.photos/seed/${id}/768/960`,
        JSON.stringify((body.match(/#(\w+)/g) ?? []).map((x) => x.slice(1))), isDrop ? drop.id : null, created);
      postIds.push(id);
    }
    // A couple of battles
    for (const [q, a, b] of [['Setup A vs Setup B — which vibe are you gaming in tonight?', 'Sunset Glow', 'Clean Minimal'], ['Coffee or matcha for the 3pm slump?', 'Coffee ☕', 'Matcha 🍵']]) {
      const id = newId('p');
      await db.run('INSERT INTO posts (id, author_id, kind, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, pick(personaIds), 'battle', q, '["setupwars"]', ago(Math.random() * 8));
      await db.run('INSERT INTO battle_options (id, post_id, label, media_url, votes, position) VALUES (?, ?, ?, NULL, ?, 0)', newId('bo'), id, a, 400 + Math.floor(Math.random() * 600));
      await db.run('INSERT INTO battle_options (id, post_id, label, media_url, votes, position) VALUES (?, ?, ?, NULL, ?, 1)', newId('bo'), id, b, 200 + Math.floor(Math.random() * 400));
    }
    // Ratings from personas, biased per post, so consensus tiers exist for roulette.
    for (const pid of postIds) {
      const post = (await db.one<Row>('SELECT author_id FROM posts WHERE id = ?', pid))!;
      const base = 2.5 + Math.random() * 2.5;
      const dist = [0, 0, 0, 0, 0];
      for (const rater of everyone) {
        if (rater === post.author_id || Math.random() < 0.35) continue;
        const s = Math.min(5, Math.max(1, Math.round(base + (Math.random() - 0.5) * 1.6)));
        await db.run('INSERT INTO ratings (post_id, user_id, score, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', pid, rater, s, t);
        dist[s - 1]++;
      }
      await db.run('UPDATE posts SET r1 = ?, r2 = ?, r3 = ?, r4 = ?, r5 = ? WHERE id = ?', ...dist, pid);
    }
    const COMMENTS = ['the colors in this 😮‍💨', 'ok this is a W', 'saving for inspo', 'where is this??', 'lowkey god tier', 'the vibe is immaculate', 'need this energy today'];
    for (const pid of postIds.slice(0, 30)) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) await db.run('INSERT INTO comments (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', newId('c'), pid, pick(everyone), pick(COMMENTS), t);
      await db.run('UPDATE posts SET comment_count = ? WHERE id = ?', n, pid);
    }

    // Hot takes
    for (const [cat, stmt, a, d] of TAKES) {
      await db.run('INSERT INTO hot_takes (id, author_id, category, statement, agree_pool, disagree_pool, agree_count, disagree_count, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId('ht'), pick(personaIds), cat, stmt, a, d, Math.round(a / 12), Math.round(d / 12), ahead(2 + Math.random() * 10), t);
    }

    // Threads
    const THREADS: [string, string, string][] = [
      ['daily', 'What’s your go-to golden hour spot?', 'Mine is the parking garage roof by my apartment. Unbeatable views, zero crowds.'],
      ['hottakes', 'Pineapple on pizza is elite and I’m tired of pretending it’s not', 'Sweet + salty is a whole cuisine. Defend yourselves.'],
      ['gaming', 'Cozy games recs for a rainy weekend?', 'Already did Stardew and Unpacked. Need more.'],
      ['music', 'Drop the song that’s on repeat for you rn', 'I’ll start: Tycho — Awake. Every. Single. Day.'],
      ['fits', 'Best thrift find of the month thread 👟', 'Found a 90s windbreaker for $8. I’m unstoppable.'],
      ['tech', 'Post your desk setup, we rate 1–10', 'Mechanical keyboard people, show yourselves.'],
    ];
    for (const [i, [board, title, body]] of THREADS.entries()) {
      const id = newId('t');
      await db.run('INSERT INTO threads (id, board_id, author_id, title, body, upvotes, reply_count, pinned, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 3, ?, ?, ?)',
        id, board, pick(personaIds), title, body, Math.floor(Math.random() * 300), i === 0 ? 1 : 0, ago(Math.random() * 10), ago(24));
      for (let k = 0; k < 3; k++) {
        await db.run('INSERT INTO replies (id, thread_id, author_id, body, upvotes, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId('r'), id, pick(personaIds), pick(['this is so real', 'hard agree', 'respectfully... no 😂', 'adding this to my list', 'ok this thread is gold']), Math.floor(Math.random() * 40), ago(Math.random() * 10));
      }
    }

    // Lounge history
    const LINES = ['who else is up rn', 'this track is carrying my whole evening', 'drop your current song 🎧', 'just did my drop go rate it 👀', 'the sunset today was insane', 'ok what are we rating today'];
    for (const [lid] of LOUNGES) {
      for (let k = 0; k < 6; k++) {
        await db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'lounge', ?, ?, ?, ?)`, newId('m'), lid, pick(personaIds), pick(LINES), ago((6 - k) * 0.2));
      }
    }

    // Welcome DM from a persona to the demo account
    const conv = newId('dm');
    await db.run('INSERT INTO conversations (id, updated_at) VALUES (?, ?)', conv, t);
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)', conv, 'u_demo', ago(1));
    await db.run('INSERT INTO conversation_members (conversation_id, user_id, last_read_at) VALUES (?, ?, ?)', conv, 'ai_mia', t);
    await db.run(`INSERT INTO messages (id, room_type, room_id, author_id, body, created_at) VALUES (?, 'dm', ?, 'ai_mia', ?, ?)`, newId('m'), conv, 'your golden hour drop yesterday was so good 🧡 what film stock was that?', ago(0.5));

    // Starter inventory for demo
    for (const item of ['frame_sunset', 'flair_fire', 'streak_freeze']) await db.run('INSERT INTO inventory (user_id, item_id, qty, acquired_at) VALUES (?, ?, 1, ?) ON CONFLICT DO NOTHING', 'u_demo', item, t);
    await db.run(`UPDATE users SET cosmetics = '{"frame":"frame_sunset","flair":"flair_fire","theme":null,"banner":null}' WHERE id = 'u_demo'`);
  });
}

export async function seedIfEmpty() {
  if (process.env.SEED === '0') return;
  await db.exclusive(async () => {
    if (await db.one('SELECT 1 AS x FROM boards LIMIT 1')) return;
    console.log('🌱 Seeding ChatLOL…');
    await seed(false);
    console.log('🌱 Seed complete — demo login: demo@chatlol.app / sunset123');
  });
}

if (process.argv[1]?.endsWith('seed.ts') && process.argv.includes('--reset')) {
  initDb().then(() => seed(true)).then(() => { console.log('Reseeded.'); process.exit(0); });
}
