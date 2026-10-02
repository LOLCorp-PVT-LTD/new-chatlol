/** Offline lines used when NVIDIA_API_KEY isn't set or NIM is rate limited — keeps the network alive in dev. */
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const COMMENTS = [
  'ok this is actually so good',
  'the lighting here?? unreal',
  'saving this for inspo',
  'lowkey obsessed with this',
  'W post honestly',
  'need the backstory on this immediately',
  'this goes hard ngl',
  'the colors 😮‍💨',
  'main character energy fr',
  'giving golden hour perfection',
  'teach me your ways',
  'how is this not trending yet',
  'the vibe is immaculate',
  'ok i see you 👀',
];
const LOUNGE = [
  'who else is up rn',
  'this track is carrying my whole evening',
  'drop your current song 🎧',
  'ok what are we rating today',
  'hot take incoming...',
  'just finished my drop, go rate it 👀',
  'someone recommend me a snack',
  'the sunset today was insane',
  'gm to everyone except people who put pineapple on pizza',
  'this lounge is the only productive thing i did today lol',
];
const DM = [
  'haha fr',
  'wait tell me more',
  'that’s actually so cool',
  'ok you have taste',
  'lol same honestly',
  'what are you up to today?',
  'did you do today’s drop yet?',
  'no way 😂',
  'love that for you',
  'ok but have you tried the roulette combo thing yet',
];
const CAPTIONS = [
  'golden hour did the heavy lifting today 🌅',
  'tiny moment, big vibe',
  'couldn’t not share this',
  'rate it honestly 👀',
  'today’s mood in one photo',
  'caught this on the way home',
  'current situation ✨',
  'proof i touched grass today',
];
const TAKES = [
  ['FOOD', 'Cereal is a soup and I will not be taking questions'],
  ['MUSIC', 'Albums should be listened to in order, no shuffle ever'],
  ['LIFESTYLE', 'Morning people are just night people who gave up'],
  ['GAMING', 'Single player games peaked in 2015'],
  ['TECH', 'Dark mode is overrated for daytime use'],
  ['STREETWEAR', 'Socks with sandals is officially a good look now'],
  ['MOVIES', 'Sequels are better than originals more often than people admit'],
  ['FOOD', 'Breakfast for dinner beats dinner for dinner'],
];
const THREADS = [
  ['What’s your comfort show you’ve rewatched 5+ times?', 'Mine is embarrassing so you go first'],
  ['Rate my weekend plan: farmers market → nap → sunset walk', 'Is this peak adulthood or am I boring now'],
  ['Best budget desk upgrade under $50?', 'Trying to level up my setup without crying at checkout'],
  ['Unpopular opinion thread 🔥', 'Drop your spiciest harmless opinion. No hate, just chaos.'],
];

const SHOUTS = [
  'who else is up way too late rn 🌙',
  'coffee number three and it is not even noon ☕',
  'need a song rec for a long drive, go 🎧',
  'golden hour from my balcony hits different today 🌇',
  'friday plans? i have none and i love it',
  'just finished a 5k and i feel unstoppable 🏃',
  'hot take: pineapple on pizza is elite 🍍',
  'whos watching anything good lately? need a new show',
  'rainy day + blanket + snacks = perfect',
  'gym was empty today, best session in weeks 💪',
  'trying a new recipe tonight, wish me luck 🍝',
  'good morning chatlol ☀️ drink some water',
  'ok who wants to battle me in the arena 😤',
  'the vibes in here today are immaculate ✨',
  'lowkey bored, someone say something interesting',
];

export const fallback = {
  shout: () => pick(SHOUTS),
  comment: (p) => (Math.random() < 0.3 ? `${pick(COMMENTS)} ${p.voice.includes('🔥') ? '🔥' : ''}`.trim() : pick(COMMENTS)),
  lounge: () => pick(LOUNGE),
  dm: () => pick(DM),
  caption: () => pick(CAPTIONS),
  take: () => pick(TAKES),
  thread: () => pick(THREADS),
  reply: () => pick(['this is so real', 'hard agree', 'respectfully... no 😂', 'ok this thread is gold', 'adding this to my list']),
};
