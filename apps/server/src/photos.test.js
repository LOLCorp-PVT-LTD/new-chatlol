import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPhoto, askedForPhoto, photoAllowed, imagePrompt } from './ai/photos.js';

test('the PHOTO line is pulled out of the reply', () => {
  const r = splitPhoto('omg yes hold on 📷\nthe light is so good rn\n[PHOTO: oat latte on a wooden cafe table by a rainy window]');
  assert.equal(r.text, 'omg yes hold on 📷\nthe light is so good rn');
  assert.equal(r.photo, 'oat latte on a wooden cafe table by a rainy window');
  assert.deepEqual(splitPhoto('just text'), { text: 'just text', photo: null });
  assert.equal(splitPhoto('here\n[photo: seattle skyline at dusk.]').photo, 'seattle skyline at dusk');
});

test('picture requests are recognised', () => {
  for (const t of ['send me a pic of your coffee', 'can you show me a photo of the view?', 'pics pls', 'got any photos from the trip', 'pic or it didnt happen'])
    assert.ok(askedForPhoto(t), t);
  for (const t of ['i took a nice photo today', 'what camera do you use', 'hello']) assert.ok(!askedForPhoto(t), t);
});

test('only safe photos: no selfies, bodies, people, children, sexual or violent content', () => {
  assert.ok(photoAllowed('latte art on a wooden cafe table'));
  assert.ok(photoAllowed('seattle skyline at golden hour from a rooftop', 'send me a pic of the view'));
  for (const d of ['a selfie at the beach', 'mirror pic in a new dress', 'photo of myself on the couch', 'kids playing in the park', 'woman in lingerie', 'a gun on a table'])
    assert.ok(!photoAllowed(d), d);
  assert.ok(!photoAllowed('sunset at the beach', 'send nudes'), 'a sexual request blocks the photo even if the description looks harmless');
});

test('image prompt stays safe for work and faceless', () => {
  assert.match(imagePrompt('latte on a table', 'Seattle, WA'), /latte on a table, in Seattle, WA, .*safe for work, no visible faces/);
});
