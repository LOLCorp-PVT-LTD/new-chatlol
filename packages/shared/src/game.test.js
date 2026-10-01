import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRatings, levelForXp, xpForLevel, arenaOdds, comboMultiplier, ageFrom, rollRarity, toTen } from './game.js';

test('summarizeRatings picks modal tier and consensus', () => {
  const s = summarizeRatings([0, 1, 1, 6, 2]);
  assert.equal(s.count, 10);
  assert.equal(s.tier, 'fire');
  assert.equal(s.consensusPct, 60);
  assert.equal(s.avg, 3.9);
});

test('empty ratings are neutral', () => {
  const s = summarizeRatings([0, 0, 0, 0, 0]);
  assert.equal(s.count, 0);
  assert.equal(toTen(s.avg), 0);
});

test('levels are monotonic', () => {
  assert.equal(levelForXp(0), 1);
  for (let l = 2; l < 40; l++) {
    assert.equal(levelForXp(xpForLevel(l)), l);
    assert.equal(levelForXp(xpForLevel(l) - 1), l - 1);
  }
});

test('arena odds favour the underdog and respect rake', () => {
  const o = arenaOdds(670, 330);
  assert.ok(o.disagree > o.agree);
  assert.ok(o.agree >= 1.05);
  assert.equal(o.agreePct, 67);
});

test('combo multiplier caps', () => {
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(5), 2);
  assert.equal(comboMultiplier(100), 3);
});

test('age gate', () => {
  const now = new Date('2026-09-30');
  assert.equal(ageFrom('2008-10-01', now), 17);
  assert.equal(ageFrom('2008-09-30', now), 18);
});

test('rarity roll boundaries', () => {
  assert.equal(rollRarity(0), 'common');
  assert.equal(rollRarity(0.999), 'legendary');
});
