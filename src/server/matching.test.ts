import assert from 'node:assert/strict';
import test from 'node:test';
import { rank } from './matching';
import type { Track } from '../../shared/types';

const source: Track = { id: 'spotify', title: 'Life Goes On', artist: 'BTS', url: '' };
const video = (id: string, title: string, artist = 'BTS'): Track => ({ id, title, artist, url: `https://www.youtube.com/watch?v=${id}` });

test('prefers the BTS Official MV over an exact audio match', () => {
  const results = rank(source, [
    video('Yl_8RyAocEE', 'Life Goes On'),
    video('-5q5mZbe3V8', "BTS (방탄소년단) 'Life Goes On' Official MV", 'HYBE LABELS'),
  ], 'youtube');
  assert.equal(results[0].id, '-5q5mZbe3V8');
  assert.ok(results[0].score > results[1].score);
});

test('official video labels do not override a wrong song or unwanted version', () => {
  for (const title of ['BTS Butter Official MV', 'BTS Life Goes On live Official MV', 'BTS Life Goes On cover Official Music Video']) {
    assert.equal(rank(source, [video('wrong', title), video('audio', 'Life Goes On')], 'youtube')[0].id, 'audio');
  }
});

test('recognizes music video spellings without changing Spotify ranking', () => {
  for (const label of ['Official MV', 'Official M/V', 'Official Music Video', 'Official Video']) {
    const candidates = [video('audio', 'Life Goes On'), video('mv', `BTS Life Goes On (${label})`)];
    assert.equal(rank(source, candidates, 'youtube')[0].id, 'mv');
    assert.equal(rank(source, candidates, 'spotify')[0].id, 'audio');
  }
});
