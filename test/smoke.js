// Starts the real app with a throwaway profile and checks that the browser
// launches and the dashboard reports that it's waiting for a Twitch login.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drops-smoke-'));
const port = 8499;

const app = spawn(process.execPath, [path.join(root, 'src', 'index.js')], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), HEADLESS: process.env.HEADLESS ?? 'true' },
  stdio: 'inherit',
});

let state;
for (let i = 0; i < 60 && state?.phase !== 'login'; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  state = await fetch(`http://127.0.0.1:${port}/api/state`).then((r) => r.json()).catch(() => undefined);
}
const page = await fetch(`http://127.0.0.1:${port}/`).catch(() => null);
app.kill();

if (state?.phase !== 'login' || !page?.ok) {
  console.error('Smoke test failed. Last state:', state, 'Dashboard page status:', page?.status);
  process.exit(1);
}
console.log('Smoke test passed: browser started, dashboard is waiting for login.');
process.exit(0);
