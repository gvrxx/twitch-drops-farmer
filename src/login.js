// Twitch refuses logins from automated browsers, so sign-in happens here: a
// normal browser window with no automation attached, using the app's profile.
// The app then reuses that saved session.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const BROWSERS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium'],
};

const browser = (BROWSERS[process.platform] ?? []).find((p) => fs.existsSync(p));
if (!browser) {
  console.error('No supported browser found. Install Google Chrome (Microsoft Edge on Windows) and try again.');
  process.exit(1);
}

const quit = process.platform === 'darwin' ? 'quit it with Cmd+Q' : 'close the window';
console.log(`Log in to Twitch in the window that opens, then ${quit}.`);

const child = spawn(
  browser,
  [`--user-data-dir=${path.join(DATA_DIR, 'browser-profile')}`, '--no-first-run', '--no-default-browser-check', 'https://www.twitch.tv/login'],
  { stdio: 'ignore' },
);
child.on('error', (err) => {
  console.error(`Couldn't open the browser: ${err.message}`);
  process.exit(1);
});
child.on('exit', () => console.log('Done. Now start the app.'));
