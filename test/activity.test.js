import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ActivityLog } from '../src/activity.js';

test('activity lines are read back after a restart', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drops-activity-')), 'activity.log');
  const first = new ActivityLog(file);
  for (let i = 0; i < 5; i++) first.append({ t: Date.UTC(2026, 10, 14, 10, i), level: i === 4 ? 'warn' : 'info', msg: `line ${i}` });
  const lines = new ActivityLog(file).recent(3);
  assert.deepEqual(lines.map((l) => l.msg), ['line 2', 'line 3', 'line 4']);
  assert.equal(lines[2].level, 'warn');
  assert.equal(lines[0].t, Date.UTC(2026, 10, 14, 10, 2));
});

test('a missing activity file gives an empty log', () => {
  assert.deepEqual(new ActivityLog(path.join(os.tmpdir(), 'no-such-dir-xyz', 'activity.log')).recent(10), []);
});
