/**
 * Festival seasons. While a festival is on (a few days before its day until a day or two after), ChatLOL dresses
 * up for it: the Daily Drop uses festival prompts, trivia games mix in festival questions, there's a daily
 * festival quiz on Home, a seasonal lounge opens, and Home shows a themed banner with a countdown.
 *
 * Fixed-date festivals compute themselves; moon-calendar ones (Diwali, Holi, Lunar New Year) come from a
 * table — extend `MOON_DATES` when the years run out. Easter and Thanksgiving are calculated.
 */
const MOON_DATES = {
  lunar: { 2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11' },
  holi: { 2025: '03-14', 2026: '03-04', 2027: '03-22', 2028: '03-11', 2029: '03-01', 2030: '03-20', 2031: '03-09', 2032: '03-27' },
  diwali: { 2025: '10-20', 2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26', 2031: '11-14', 2032: '11-02' },
};

/** Easter Sunday (Gregorian, "anonymous" algorithm) as MM-DD. */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
/** US Thanksgiving: 4th Thursday of November. */
function thanksgiving(y) {
  const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  return `11-${String(1 + ((4 - first + 7) % 7) + 21).padStart(2, '0')}`;
}

export const FESTIVALS = [
  {
    key: 'newyear', name: 'New Year', emoji: '🎆', greeting: 'Happy New Year!', date: () => '01-01', before: 2, after: 1,
    gradient: 'linear-gradient(135deg,#0f0c29,#302b63,#b8860b)',
    drops: [['Your New Year’s Eve Fit', '🥂'], ['Midnight Sky — Fireworks Edition', '🎆'], ['One Photo That Sums Up Your Year', '📸'], ['Your Resolution in One Picture', '📝']],
    lounge: ['🎆', 'Countdown Party', 'Ring in the new year together', 'Auld Lang Syne (club mix)'],
    trivia: [
      ['Which city is one of the first major cities to celebrate New Year each year?', 'Auckland', 'London', 'New York', 'Paris'],
      ['What song is traditionally sung at midnight on New Year’s Eve in the UK?', 'Auld Lang Syne', 'Jingle Bells', 'Yesterday', 'Wonderwall'],
      ['In Spain, how many grapes do people eat at midnight?', '12', '7', '10', '20'],
      ['Where does the famous New Year ball drop happen?', 'Times Square', 'Central Park', 'Hollywood', 'Trafalgar Square'],
      ['Which calendar is the 1 January New Year based on?', 'Gregorian', 'Julian', 'Lunar', 'Mayan'],
    ],
  },
  {
    key: 'lunar', name: 'Lunar New Year', emoji: '🧧', greeting: 'Happy Lunar New Year!', date: (y) => MOON_DATES.lunar[y], before: 2, after: 3,
    gradient: 'linear-gradient(135deg,#8b0000,#d7263d,#f4c430)',
    drops: [['Red Outfit Check', '🧧'], ['Your Reunion Dinner Table', '🥟'], ['Lanterns Near You', '🏮']],
    lounge: ['🧧', 'Lunar New Year Lounge', 'Red envelopes, dumplings and good luck', 'Gong Xi Fa Cai'],
    trivia: [
      ['How many animals are in the Chinese zodiac?', '12', '10', '8', '24'],
      ['What colour is considered lucky at Lunar New Year?', 'Red', 'White', 'Black', 'Blue'],
      ['What are given in red envelopes?', 'Money', 'Sweets', 'Letters', 'Tea'],
      ['Which animal is the first in the Chinese zodiac?', 'Rat', 'Ox', 'Dragon', 'Tiger'],
      ['How many days do traditional Lunar New Year celebrations last?', '15', '3', '7', '30'],
    ],
  },
  {
    key: 'valentines', name: 'Valentine’s Day', emoji: '💘', greeting: 'Happy Valentine’s Day!', date: () => '02-14', before: 3, after: 0,
    gradient: 'linear-gradient(135deg,#ff4d8d,#ff1f5a,#ffb3c7)',
    drops: [['Date Night Fit', '💘'], ['Something That Makes You Smile', '🥰'], ['Your Favourite Love Song Cover Art', '🎶']],
    lounge: ['💘', 'Lonely Hearts Club', 'Single, taken or it’s complicated — all welcome', 'Lover — Taylor Swift'],
    trivia: [
      ['Which Roman god is linked with Valentine’s Day?', 'Cupid', 'Mars', 'Jupiter', 'Mercury'],
      ['What flower is most popular on Valentine’s Day?', 'Red rose', 'Tulip', 'Daisy', 'Sunflower'],
      ['In which month is Valentine’s Day?', 'February', 'March', 'January', 'April'],
      ['What does “XOXO” stand for?', 'Hugs and kisses', 'Laughing out loud', 'See you soon', 'Thank you'],
    ],
  },
  {
    key: 'holi', name: 'Holi', emoji: '🎨', greeting: 'Happy Holi!', date: (y) => MOON_DATES.holi[y], before: 2, after: 1,
    gradient: 'linear-gradient(135deg,#ff2bd6,#ffb300,#00c2ff,#33e07a)',
    drops: [['Covered in Colour', '🎨'], ['Your Holi Sweets', '🍬'], ['Brightest Thing Around You', '🌈']],
    lounge: ['🎨', 'Holi Colour Party', 'Splash some colour in the chat', 'Balam Pichkari'],
    trivia: [
      ['Holi is known as the festival of…', 'Colours', 'Lights', 'Kites', 'Harvest'],
      ['Holi marks the arrival of which season?', 'Spring', 'Winter', 'Monsoon', 'Autumn'],
      ['What is the bonfire the night before Holi called?', 'Holika Dahan', 'Lohri', 'Pongal', 'Onam'],
      ['What is the coloured powder thrown at Holi called?', 'Gulal', 'Henna', 'Kumkum', 'Turmeric'],
    ],
  },
  {
    key: 'stpatricks', name: 'St Patrick’s Day', emoji: '☘️', greeting: 'Happy St Patrick’s Day!', date: () => '03-17', before: 1, after: 0,
    gradient: 'linear-gradient(135deg,#0b6e4f,#21a179,#f7b32b)',
    drops: [['Wearing Green', '☘️'], ['Your Lucky Charm', '🍀']],
    lounge: ['☘️', 'Paddy’s Day Pub', 'Craic, music and green everything', 'Galway Girl'],
    trivia: [
      ['St Patrick is the patron saint of which country?', 'Ireland', 'Scotland', 'Wales', 'England'],
      ['How many leaves does a lucky clover have?', 'Four', 'Three', 'Five', 'Two'],
      ['Which city dyes its river green for St Patrick’s Day?', 'Chicago', 'Boston', 'Dublin', 'New York'],
    ],
  },
  {
    key: 'easter', name: 'Easter', emoji: '🐣', greeting: 'Happy Easter!', date: (y) => easter(y), before: 2, after: 1,
    gradient: 'linear-gradient(135deg,#ffd6e8,#c3f0ca,#fff3b0)',
    drops: [['Your Easter Eggs', '🥚'], ['Spring Blooms', '🌷'], ['Chocolate Haul', '🍫']],
    lounge: ['🐣', 'Egg Hunt Lounge', 'Chocolate, bunnies and spring', 'Here Comes the Sun'],
    trivia: [
      ['Which animal traditionally delivers Easter eggs?', 'Bunny', 'Chick', 'Lamb', 'Duck'],
      ['Easter always falls on which day of the week?', 'Sunday', 'Friday', 'Monday', 'Saturday'],
      ['What is the Friday before Easter called?', 'Good Friday', 'Black Friday', 'Holy Friday', 'Palm Friday'],
      ['What are hot cross buns traditionally eaten on?', 'Good Friday', 'Christmas', 'New Year', 'Halloween'],
    ],
  },
  {
    key: 'halloween', name: 'Halloween', emoji: '🎃', greeting: 'Happy Halloween!', date: () => '10-31', before: 10, after: 0,
    gradient: 'linear-gradient(135deg,#1a0b2e,#ff6a00,#2d0b3b)',
    drops: [['Your Costume Reveal', '🧛'], ['Jack-o’-Lantern Carving', '🎃'], ['Spookiest Spot Near You', '👻'], ['Halloween Snack Haul', '🍬'], ['Horror Movie Night Setup', '🍿']],
    lounge: ['🎃', 'Haunted House', 'Spooky stories, costumes and screams', 'Thriller — Michael Jackson'],
    trivia: [
      ['Which vegetable was carved into lanterns before pumpkins?', 'Turnip', 'Potato', 'Carrot', 'Onion'],
      ['Halloween comes from which ancient Celtic festival?', 'Samhain', 'Beltane', 'Imbolc', 'Lughnasadh'],
      ['What is a fear of Halloween called?', 'Samhainophobia', 'Arachnophobia', 'Claustrophobia', 'Nyctophobia'],
      ['Which author wrote “Dracula”?', 'Bram Stoker', 'Mary Shelley', 'Edgar Allan Poe', 'Stephen King'],
      ['What do people traditionally say when trick-or-treating?', 'Trick or treat!', 'Boo!', 'Happy Halloween!', 'Sweets please!'],
      ['Who wrote “Frankenstein”?', 'Mary Shelley', 'Bram Stoker', 'H. G. Wells', 'Charles Dickens'],
    ],
  },
  {
    key: 'diwali', name: 'Diwali', emoji: '🪔', greeting: 'Happy Diwali!', date: (y) => MOON_DATES.diwali[y], before: 3, after: 2,
    gradient: 'linear-gradient(135deg,#3b0a45,#ff9933,#ffd700)',
    drops: [['Diyas & Lights', '🪔'], ['Your Rangoli', '🌺'], ['Diwali Sweets (Mithai)', '🍬'], ['Festive Fit', '✨']],
    lounge: ['🪔', 'Diwali Lights', 'Lights, sweets and family time', 'Diwali vibes playlist'],
    trivia: [
      ['Diwali is known as the festival of…', 'Lights', 'Colours', 'Harvest', 'Kites'],
      ['What are the small oil lamps lit at Diwali called?', 'Diyas', 'Lanterns', 'Kandils', 'Agarbattis'],
      ['Which goddess of wealth is worshipped at Diwali?', 'Lakshmi', 'Durga', 'Saraswati', 'Kali'],
      ['What are the colourful floor patterns made at Diwali?', 'Rangoli', 'Mehndi', 'Kolam-kari', 'Madhubani'],
      ['Diwali celebrates the return of which king to Ayodhya?', 'Rama', 'Krishna', 'Arjuna', 'Ravana'],
    ],
  },
  {
    key: 'bonfire', name: 'Bonfire Night', emoji: '🔥', greeting: 'Remember, remember the 5th of November!', date: () => '11-05', before: 1, after: 0,
    gradient: 'linear-gradient(135deg,#120a05,#c1440e,#ffb347)',
    drops: [['Fireworks Shot', '🎇'], ['Bonfire Glow', '🔥']],
    lounge: ['🔥', 'Bonfire Night', 'Fireworks, sparklers and toffee apples', 'Firework — Katy Perry'],
    trivia: [
      ['Bonfire Night remembers which failed plot?', 'The Gunpowder Plot', 'The Cato Street Plot', 'The Rye House Plot', 'The Babington Plot'],
      ['In which year was the Gunpowder Plot?', '1605', '1666', '1588', '1715'],
      ['Who is the best-known Gunpowder plotter?', 'Guy Fawkes', 'Robert Catesby', 'Thomas Percy', 'John Wright'],
    ],
  },
  {
    key: 'thanksgiving', name: 'Thanksgiving', emoji: '🦃', greeting: 'Happy Thanksgiving!', date: (y) => thanksgiving(y), before: 2, after: 1,
    gradient: 'linear-gradient(135deg,#6b3e26,#c8702a,#f2c14e)',
    drops: [['Your Thanksgiving Plate', '🦃'], ['What You’re Thankful For', '🙏'], ['Pie Ranking', '🥧']],
    lounge: ['🦃', 'Friendsgiving', 'Share what you’re thankful for', 'Cozy acoustic'],
    trivia: [
      ['Which bird is the centrepiece of a Thanksgiving dinner?', 'Turkey', 'Chicken', 'Duck', 'Goose'],
      ['Thanksgiving falls on which day of the week in the US?', 'Thursday', 'Friday', 'Sunday', 'Monday'],
      ['What is the shopping day after Thanksgiving called?', 'Black Friday', 'Cyber Monday', 'Super Saturday', 'Boxing Day'],
    ],
  },
  {
    key: 'christmas', name: 'Christmas', emoji: '🎄', greeting: 'Merry Christmas!', date: () => '12-25', before: 10, after: 1,
    gradient: 'linear-gradient(135deg,#0b3d20,#c0392b,#f5e6c8)',
    drops: [['Your Christmas Tree', '🎄'], ['Ugly Christmas Jumper', '🧶'], ['Christmas Dinner', '🍗'], ['Gift Wrapping Skills', '🎁'], ['Festive Lights Near You', '✨']],
    lounge: ['🎄', 'Christmas Grotto', 'Mince pies, movies and good vibes', 'All I Want for Christmas Is You'],
    trivia: [
      ['How many reindeer pull Santa’s sleigh (with Rudolph)?', '9', '8', '7', '12'],
      ['Which country started the Christmas tree tradition?', 'Germany', 'England', 'USA', 'Norway'],
      ['In “The Twelve Days of Christmas”, what is given on day 5?', 'Five gold rings', 'Five calling birds', 'Five geese', 'Five drummers'],
      ['What is the day after Christmas called in the UK?', 'Boxing Day', 'St Stephen’s Day', 'Gift Day', 'Second Christmas'],
      ['Which plant do people kiss under at Christmas?', 'Mistletoe', 'Holly', 'Ivy', 'Poinsettia'],
      ['Who wrote “A Christmas Carol”?', 'Charles Dickens', 'Jane Austen', 'Mark Twain', 'Roald Dahl'],
    ],
  },
];
export const festivalByKey = (k) => FESTIVALS.find((f) => f.key === k) ?? null;

const DAY = 86_400_000;
/** This festival's dates around `year`: { day, start, end } (ms, UTC midnights; end = end of the last day). */
function window(f, year) {
  const md = f.date(year);
  if (!md) return null;
  const day = Date.parse(`${year}-${md}T00:00:00Z`);
  return { day, start: day - f.before * DAY, end: day + (f.after + 1) * DAY - 1 };
}

/** Every festival occurrence overlapping the year before/of/after `at`. */
function occurrences(at) {
  const y = new Date(at).getUTCFullYear();
  const out = [];
  for (const f of FESTIVALS) for (const yy of [y - 1, y, y + 1]) {
    const w = window(f, yy);
    if (w) out.push({ f, ...w });
  }
  return out;
}

/**
 * The festival running at `at` (ms or Date), or null. If two overlap, the one whose big day is nearest wins.
 * `disabled`: keys switched off by staff. Returns a plain summary safe to send to apps.
 */
export function activeFestival(at = Date.now(), disabled = []) {
  const t = +new Date(at);
  const on = occurrences(t).filter((o) => !disabled.includes(o.f.key) && t >= o.start && t <= o.end);
  if (!on.length) return null;
  on.sort((a, b) => Math.abs(t - a.day) - Math.abs(t - b.day));
  return summary(on[0]);
}

/** The next `n` festivals from `at` (including one running now). */
export function upcomingFestivals(at = Date.now(), n = 6) {
  const t = +new Date(at);
  return occurrences(t)
    .filter((o) => o.end >= t)
    .sort((a, b) => a.start - b.start)
    .slice(0, n)
    .map(summary);
}

function summary({ f, day, start, end }) {
  return {
    key: f.key, name: f.name, emoji: f.emoji, greeting: f.greeting, gradient: f.gradient,
    day: new Date(day).toISOString(), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
  };
}

/** Festival drop prompt for a day number (stable for the day). */
export function festivalDrop(key, dayNumber) {
  const f = festivalByKey(key);
  return f ? f.drops[dayNumber % f.drops.length] : null;
}

/** Festival trivia in the shared trivia format: [category, question, right, wrong×3]. */
export function festivalTrivia(key) {
  const f = festivalByKey(key);
  return f ? f.trivia.map(([q, right, ...wrong]) => [`${f.emoji} ${f.name}`, q, right, ...wrong]) : [];
}
