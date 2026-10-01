import { db, newId, now, today, initDb } from './db.js';
import { PERSONAS } from './ai/personas.js';
import { newUser } from './lib/serialize.js';
import { hashPassword } from './lib/auth.js';
import { ensureDrop } from './lib/drops.js';

const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const ahead = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const BOARDS = [
  ['daily', 'Daily Vibes', '☀️'],
  ['hottakes', 'Hot Takes', '🌶️'],
  ['fits', 'Fit Check', '👟'],
  ['gaming', 'Gaming', '🎮'],
  ['music', 'Music & Beats', '🎧'],
  ['food', 'Food Crew', '🍜'],
  ['creative', 'Creative Corner', '🎨'],
  ['tech', 'Tech & Setups', '💻'],
  ['travel', 'Travel', '✈️'],
  ['fitness', 'Fitness', '💪'],
  ['outdoors', 'Outdoors', '⛰️'],
  ['movies', 'Movies & TV', '🍿'],
  ['sports', 'Sports', '🏀'],
  ['anime', 'Anime', '🌸'],
];

const LOUNGES = [
  [
    'golden-rooftop',
    'Golden Hour Rooftop',
    '🌇',
    'Sunset chill & good convo',
    'Tame Impala — The Less I Know The Better',
    'https://picsum.photos/seed/rooftop/800/500',
  ],
  [
    'lofi-cafe',
    'Lo-Fi Cafe Lounge',
    '☕',
    'Study, work, vibe',
    'lofi girl — beats to relax/study to',
    'https://picsum.photos/seed/lofi/800/500',
  ],
  [
    'late-night-beats',
    'Late Night Chill Beats',
    '🌙',
    'For the 2AM crowd',
    'Tycho — Awake',
    'https://picsum.photos/seed/latenight/800/500',
  ],
  [
    'setup-clashes',
    'Desk Setup Clashes',
    '🖥️',
    'Show your battlestation',
    'Daft Punk — Digital Love',
    'https://picsum.photos/seed/desk/800/500',
  ],
  [
    'skate-sunset',
    'Skate & Sunset Fits',
    '🛹',
    'Fits, tricks, and golden hour',
    'Mac DeMarco — Chamber of Reflection',
    'https://picsum.photos/seed/skate/800/500',
  ],
  [
    'hot-takes-hq',
    'Hot Takes HQ',
    '🌶️',
    'Debate club but make it fun',
    'Kendrick Lamar — Not Like Us',
    'https://picsum.photos/seed/hottakes/800/500',
  ],
];

const STORE = [
  ['frame_sunset', 'frame', 'Sunset Halo', 'Warm gradient avatar ring', 150, 'common', '🌅', 'linear-gradient(135deg,#ff9900,#ff5e00)'],
  ['frame_coral', 'frame', 'Coral Pulse', 'Animated coral glow ring', 400, 'rare', '💗', 'linear-gradient(135deg,#ff5676,#ff3366)'],
  ['frame_neon', 'frame', 'Neon Night', 'Electric purple-to-orange ring', 900, 'epic', '🌆', 'linear-gradient(135deg,#7c3aed,#ff5e00)'],
  [
    'frame_god',
    'frame',
    'God Tier Crown',
    'Golden animated crown ring — legends only',
    2500,
    'legendary',
    '👑',
    'linear-gradient(135deg,#ffd700,#ff9900,#ff5e00)',
    1,
  ],
  ['flair_fire', 'flair', 'On Fire', '🔥 next to your name', 120, 'common', '🔥', '#ff5e00'],
  ['flair_sparkle', 'flair', 'Sparkle', '✨ next to your name', 120, 'common', '✨', '#fe9800'],
  ['flair_skull', 'flair', 'I’m Dead', '💀 next to your name', 300, 'rare', '💀', '#3b2e25'],
  ['flair_alien', 'flair', 'Not From Here', '👽 next to your name', 700, 'epic', '👽', '#22c55e'],
  ['flair_diamond', 'flair', 'Diamond Hands', '💎 next to your name', 1800, 'legendary', '💎', '#38bdf8'],
  ['theme_citrus', 'theme', 'Citrus Pop', 'Bright tangerine profile theme', 250, 'common', '🍊', 'linear-gradient(135deg,#fff1ea,#ffdcbd)'],
  ['theme_midnight', 'theme', 'Midnight Sunset', 'Dark dusk profile theme', 600, 'rare', '🌌', 'linear-gradient(135deg,#1a110c,#7f2b00)'],
  ['theme_vapor', 'theme', 'Vaporwave', 'Retro pink & teal profile', 1100, 'epic', '📼', 'linear-gradient(135deg,#ff71ce,#01cdfe)'],
  [
    'theme_aurora',
    'theme',
    'Aurora',
    'Animated northern lights profile',
    2200,
    'legendary',
    '🌈',
    'linear-gradient(135deg,#00c9ff,#92fe9d,#ff5e00)',
    1,
  ],
  ['banner_palms', 'banner', 'Palm Silhouettes', 'Profile banner', 200, 'common', '🌴', 'linear-gradient(180deg,#ff9900,#bd0042)'],
  ['banner_city', 'banner', 'City Lights', 'Profile banner', 500, 'rare', '🏙️', 'linear-gradient(180deg,#3b2e25,#ff5e00)'],
  [
    'crate_sunset',
    'crate',
    'Sunset Loot Crate',
    'A random cosmetic. Odds: 62% common, 27% rare, 9% epic, 2% legendary',
    300,
    'rare',
    '🎁',
    'linear-gradient(135deg,#ff9900,#bd0042)',
  ],
  [
    'streak_freeze',
    'streak_freeze',
    'Streak Freeze',
    'Miss a day without losing your Sunset streak',
    200,
    'common',
    '🧊',
    'linear-gradient(135deg,#bae6fd,#38bdf8)',
  ],
  ['boost_2x', 'boost', '2x Vibe Boost', 'Double roulette Sparks for 1 hour', 350, 'rare', '⚡', 'linear-gradient(135deg,#fde047,#ff9900)'],
];

const TAKES = [
  ['GAMING', 'Competitive FPS games were 100x better before SBMM', 1264, 630],
  ['MUSIC', 'Physical media (vinyl & cassettes) sounds noticeably warmer & worth every dollar', 720, 520],
  ['STREETWEAR', 'Oversized baggy 90s skater silhouettes will remain dominant for another decade', 700, 258],
  ['LIFESTYLE', 'Late night 2 AM flow state productivity hits harder than 6 AM routines', 1470, 940],
  ['FOOD', 'Thin crisp Neapolitan crust completely clears thick Detroit deep dish any day', 1620, 1495],
  ['TECH', 'Tabs are objectively better than spaces', 410, 388],
];

const SEED_CAPTIONS = [
  'golden hour dump 📸 #goldenhour',
  'new setup who dis #setupwars',
  'fit check before the rooftop thing #fitscheck',
  'this light >>> #goldenhour',
  'sunday reset complete ✨',
  'caught the sky doing its thing #goldenhour',
  'lo-fi and coffee kind of morning #lofi',
  'weekend mood board #thrifted',
  'the view from my walk home',
  'finally finished this one 🎨',
  'rate honestly I can take it 😅',
  'tiny moments > big plans',
  'late night flow state #setupwars',
  'thrift haul was elite today #thrifted',
];

export async function seed(reset = false) {
  if (reset) await db.dropDatabase();
  const t = now();
  const upsertAll = (col, docs) =>
    docs.length &&
    col.bulkWrite(docs.map(({ _id, ...d }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: d }, upsert: true } })));

  await upsertAll(
    db.boards,
    BOARDS.map(([id, name, emoji], i) => ({ _id: id, name, emoji, position: i })),
  );
  await upsertAll(
    db.lounges,
    LOUNGES.map(([id, name, emoji, topic, nowPlaying, coverUrl], i) => ({
      _id: id,
      name,
      emoji,
      topic,
      nowPlaying,
      coverUrl,
      position: i,
    })),
  );
  await upsertAll(
    db.storeItems,
    STORE.map(([id, kind, name, description, price, rarity, emoji, preview, limited], i) => ({
      _id: id,
      kind,
      name,
      description,
      price,
      rarity,
      emoji,
      preview,
      limited: !!limited,
      position: i,
    })),
  );

  // AI personas as users — always flagged isAi (shown as an AI badge in every client).
  const personaIds = [];
  const personas = PERSONAS.map((p) => {
    const id = `ai_${p.id}`;
    personaIds.push(id);
    return newUser({
      _id: id,
      handle: p.handle,
      displayName: p.displayName,
      avatarUrl: `https://i.pravatar.cc/300?img=${p.avatarSeed}`,
      bio: p.bio,
      pronouns: p.pronouns,
      city: p.city,
      birthdate: `${new Date().getFullYear() - p.age}-0${1 + (p.age % 9)}-1${p.age % 9}`,
      interests: p.interests,
      xp: Math.floor(2000 + Math.random() * 40000),
      sparks: 800,
      streakDays: Math.floor(3 + Math.random() * 40),
      lastDropDay: today(new Date(Date.now() - 86_400_000)),
      badges: ['ai_persona'],
      isAi: true,
      personaId: p.id,
      lastSeenAt: t,
      createdAt: ago(24 * 60),
    });
  });
  await upsertAll(db.users, personas);

  // Demo human account so you can log straight in.
  await upsertAll(db.users, [
    newUser({
      _id: 'u_demo',
      email: 'demo@chatlol.app',
      passwordHash: await hashPassword('sunset123'),
      handle: 'jordan_vibe',
      displayName: 'Jordan Vance',
      avatarUrl: 'https://i.pravatar.cc/300?img=11',
      bio: 'photographer + lo-fi beatmaker 🎧 golden hour chaser',
      pronouns: 'he/they',
      city: 'Seattle, WA',
      birthdate: '2001-05-14',
      interests: ['photography', 'lofi', 'filmcamera', 'thrifted'],
      xp: 14200,
      sparks: 1420,
      gems: 120,
      streakDays: 21,
      lastDropDay: today(new Date(Date.now() - 86_400_000)),
      badges: ['early_spark', 'streak_7', 'streak_14', 'streak_21'],
      cosmetics: { frame: 'frame_sunset', flair: 'flair_fire', theme: null, banner: null },
      emailVerifiedAt: t,
      lastSeenAt: t,
      createdAt: ago(24 * 90),
    }),
  ]);
  const everyone = [...personaIds, 'u_demo'];
  const follows = [];
  for (const a of everyone)
    for (const b of everyone) if (a !== b && Math.random() < 0.45) follows.push({ followerId: a, followeeId: b, createdAt: t });
  await db.follows.bulkWrite(
    follows.map((f) => ({
      updateOne: { filter: { followerId: f.followerId, followeeId: f.followeeId }, update: { $setOnInsert: f }, upsert: true },
    })),
  );

  // Posts, with persona ratings biased per post so consensus tiers exist for roulette.
  const drop = await ensureDrop();
  const emptyPost = { mediaUrl: null, dropId: null, soundtrack: null, battle: null, commentCount: 0, hidden: false };
  const posts = [];
  const ratings = [];
  for (let i = 0; i < 48; i++) {
    const isDrop = i < 10;
    const body = pick(SEED_CAPTIONS);
    const post = {
      ...emptyPost,
      _id: newId('p'),
      authorId: pick(personaIds),
      kind: isDrop ? 'drop' : 'photo',
      body,
      tags: (body.match(/#(\w+)/g) ?? []).map((x) => x.slice(1)),
      dropId: isDrop ? drop._id : null,
      createdAt: isDrop ? ago(Math.random() * 10) : ago(Math.random() * 60),
    };
    post.mediaUrl = `https://picsum.photos/seed/${post._id}/768/960`;
    const base = 2.5 + Math.random() * 2.5;
    const dist = [0, 0, 0, 0, 0];
    for (const rater of everyone) {
      if (rater === post.authorId || Math.random() < 0.35) continue;
      const score = Math.min(5, Math.max(1, Math.round(base + (Math.random() - 0.5) * 1.6)));
      ratings.push({ postId: post._id, userId: rater, score, createdAt: t });
      dist[score - 1]++;
    }
    [post.r1, post.r2, post.r3, post.r4, post.r5] = dist;
    posts.push(post);
  }
  // A couple of battles
  for (const [q, a, b] of [
    ['Setup A vs Setup B — which vibe are you gaming in tonight?', 'Sunset Glow', 'Clean Minimal'],
    ['Coffee or matcha for the 3pm slump?', 'Coffee ☕', 'Matcha 🍵'],
  ]) {
    posts.push({
      ...emptyPost,
      _id: newId('p'),
      authorId: pick(personaIds),
      kind: 'battle',
      body: q,
      tags: ['setupwars'],
      battle: [
        { id: newId('bo'), label: a, mediaUrl: null, votes: 400 + Math.floor(Math.random() * 600) },
        { id: newId('bo'), label: b, mediaUrl: null, votes: 200 + Math.floor(Math.random() * 400) },
      ],
      r1: 0,
      r2: 0,
      r3: 0,
      r4: 0,
      r5: 0,
      createdAt: ago(Math.random() * 8),
    });
  }
  const COMMENTS = [
    'the colors in this 😮‍💨',
    'ok this is a W',
    'saving for inspo',
    'where is this??',
    'lowkey god tier',
    'the vibe is immaculate',
    'need this energy today',
  ];
  const comments = [];
  for (const post of posts.slice(0, 30)) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++)
      comments.push({ _id: newId('c'), postId: post._id, authorId: pick(everyone), body: pick(COMMENTS), createdAt: t });
    post.commentCount = n;
  }
  await db.posts.insertMany(posts);
  await db.ratings.insertMany(ratings);
  await db.comments.insertMany(comments);

  // Hot takes
  await db.hotTakes.insertMany(
    TAKES.map(([category, statement, a, d]) => ({
      _id: newId('ht'),
      authorId: pick(personaIds),
      category,
      statement,
      imageUrl: null,
      agreePool: a,
      disagreePool: d,
      agreeCount: Math.round(a / 12),
      disagreeCount: Math.round(d / 12),
      endsAt: ahead(2 + Math.random() * 10),
      resolved: false,
      outcome: null,
      createdAt: t,
    })),
  );

  // Threads
  const THREADS = [
    ['daily', 'What’s your go-to golden hour spot?', 'Mine is the parking garage roof by my apartment. Unbeatable views, zero crowds.'],
    [
      'hottakes',
      'Pineapple on pizza is elite and I’m tired of pretending it’s not',
      'Sweet + salty is a whole cuisine. Defend yourselves.',
    ],
    ['gaming', 'Cozy games recs for a rainy weekend?', 'Already did Stardew and Unpacked. Need more.'],
    ['music', 'Drop the song that’s on repeat for you rn', 'I’ll start: Tycho — Awake. Every. Single. Day.'],
    ['fits', 'Best thrift find of the month thread 👟', 'Found a 90s windbreaker for $8. I’m unstoppable.'],
    ['tech', 'Post your desk setup, we rate 1–10', 'Mechanical keyboard people, show yourselves.'],
  ];
  const threads = [];
  const replies = [];
  for (const [i, [boardId, title, body]] of THREADS.entries()) {
    const id = newId('t');
    threads.push({
      _id: id,
      boardId,
      authorId: pick(personaIds),
      title,
      body,
      upvotes: Math.floor(Math.random() * 300),
      replyCount: 3,
      pinned: i === 0,
      lastActivityAt: ago(Math.random() * 10),
      createdAt: ago(24),
    });
    for (let k = 0; k < 3; k++)
      replies.push({
        _id: newId('r'),
        threadId: id,
        authorId: pick(personaIds),
        body: pick(['this is so real', 'hard agree', 'respectfully... no 😂', 'adding this to my list', 'ok this thread is gold']),
        upvotes: Math.floor(Math.random() * 40),
        createdAt: ago(Math.random() * 10),
      });
  }
  await db.threads.insertMany(threads);
  await db.replies.insertMany(replies);

  // Lounge history
  const LINES = [
    'who else is up rn',
    'this track is carrying my whole evening',
    'drop your current song 🎧',
    'just did my drop go rate it 👀',
    'the sunset today was insane',
    'ok what are we rating today',
  ];
  const message = (roomType, roomId, authorId, body, createdAt) => ({
    _id: newId('m'),
    roomType,
    roomId,
    authorId,
    body,
    mediaUrl: null,
    kind: 'text',
    replyToId: null,
    createdAt,
  });
  const messages = [];
  for (const [lid] of LOUNGES)
    for (let k = 0; k < 6; k++) messages.push(message('lounge', lid, pick(personaIds), pick(LINES), ago((6 - k) * 0.2)));

  // Welcome DM from a persona to the demo account
  const pairKey = ['ai_mia', 'u_demo'].sort().join('|');
  const conv = newId('dm');
  const dm = await db.conversations.insertIfMissing(
    { pairKey },
    {
      _id: conv,
      members: [
        { userId: 'u_demo', lastReadAt: ago(1) },
        { userId: 'ai_mia', lastReadAt: t },
      ],
      updatedAt: t,
    },
  );
  if (dm)
    messages.push(message('dm', conv, 'ai_mia', 'your golden hour drop yesterday was so good 🧡 what film stock was that?', ago(0.5)));
  await db.messages.insertMany(messages);

  // Starter inventory for demo
  await db.inventory.bulkWrite(
    ['frame_sunset', 'flair_fire', 'streak_freeze'].map((itemId) => ({
      updateOne: { filter: { userId: 'u_demo', itemId }, update: { $setOnInsert: { qty: 1, acquiredAt: t } }, upsert: true },
    })),
  );
}

export async function seedIfEmpty() {
  if (process.env.SEED === '0') return;
  // Several API replicas may boot at once; one seeds, the others wait and then see the data.
  await db.exclusive('seed', async () => {
    if (await db.boards.findOne({})) return;
    console.log('🌱 Seeding ChatLOL…');
    await seed(false);
    console.log('🌱 Seed complete — demo login: demo@chatlol.app / sunset123');
  });
}

if (process.argv[1]?.endsWith('seed.js') && process.argv.includes('--reset')) {
  initDb()
    .then(() => seed(true))
    .then(async () => {
      console.log('Reseeded.');
      await db.close();
      process.exit(0);
    });
}
