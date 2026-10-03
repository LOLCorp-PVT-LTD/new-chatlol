import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPersona, extractJson } from './ai/personaFactory.js';

const good = {
  displayName: 'Ayo Bello',
  handle: '@ayo.cooks',
  age: 29,
  pronouns: 'he/him',
  city: 'Lagos, Nigeria',
  timezone: 'Africa/Lagos',
  bio: 'line cook by day, jollof purist always 🍲',
  interests: ['Cooking', 'afrobeats', 'football', 'street food'],
  voice: 'warm, teasing, pidgin sprinkles, lots of 😂',
  photoIdeas: ['pot of jollof rice on a gas stove', 'lagos traffic at sunset from a bridge', 'a kid playing football', 'spice market stall'],
  avatarIdea: 'a chef knife on a cutting board with peppers',
  albums: ['kitchen', 'lagos nights'],
};

test('model JSON is found inside fenced or chatty replies', () => {
  assert.equal(extractJson('Sure! ```json\n[{"a":1},{"a":2}]\n```')?.length, 2);
  assert.equal(extractJson('{"a":1}')?.length, 1);
  assert.equal(extractJson('no json here'), null);
});

test('a generated persona is cleaned: handle, interests, timezone, and photo ideas with people dropped', () => {
  const p = cleanPersona(good, new Set());
  assert.equal(p.handle, 'ayo.cooks');
  assert.deepEqual(p.interests, ['cooking', 'afrobeats', 'football', 'streetfood']);
  assert.equal(p.timezone, 'Africa/Lagos');
  assert.ok(!p.photoIdeas.some((i) => /kid/.test(i)), 'photo ideas showing children are dropped');
  assert.match(p.id, /^gen-ayo-cooks-/);
});

test('minors, missing fields and taken handles are handled', () => {
  assert.equal(cleanPersona({ ...good, age: 16 }), null, 'no minors');
  assert.equal(cleanPersona({ ...good, bio: '' }), null);
  assert.equal(cleanPersona({ ...good, pronouns: 'xyz' }), null);
  const taken = new Set(['ayo.cooks']);
  assert.equal(cleanPersona(good, taken).handle, 'ayo.cooks2');
  assert.equal(cleanPersona({ ...good, timezone: 'Mars/Base' }).timezone, 'America/New_York');
});
