import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { History } from '../src/history.js';

test('claims and watch time survive a restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drops-history-')), 'history.json');
  const first = new History(file);
  first.addClaim({ gameId: 'g1', game: 'Enshrouded', campaign: 'Artificer', drop: 'Star Map' });
  first.addWatch('g1', 'Enshrouded', 90);
  first.addWatch('g1', 'Enshrouded', 0.5);
  first.save();

  const snap = new History(file).snapshot();
  assert.equal(snap.claims[0].drop, 'Star Map');
  assert.deepEqual(snap.watch, [{ gameId: 'g1', name: 'Enshrouded', minutes: 91 }]);
});

test('an unreadable history file starts fresh', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drops-history-')), 'history.json');
  fs.writeFileSync(file, '{not json');
  const snap = new History(file).snapshot();
  assert.deepEqual(snap.claims, []);
  assert.deepEqual(snap.watch, []);
});
