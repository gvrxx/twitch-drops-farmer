// Twitch refuses logins from automated browsers, so sign-in happens in a
// normal browser window with no automation attached, using the app's profile.
// The app then reuses that saved session.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const BROWSERS = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'],
};

export function findSignInBrowser() {
  return (BROWSERS[process.platform] ?? []).find((p) => fs.existsSync(p)) ?? null;
}

// Opens Twitch's login page in a normal browser on the app's profile. The
// returned process exits when the window is closed.
export function openSignInBrowser(profileDir, { container = false } = {}) {
  const browser = findSignInBrowser();
  if (!browser) throw new Error('No supported browser found. Install Google Chrome (Microsoft Edge on Windows) and try again.');
  const args = [`--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check'];
  if (process.platform === 'linux') {
    // Matches the app's own browser, so both read the same saved cookies.
    args.push('--password-store=basic');
  }
  if (container) {
    // Docker runs as root, where Chrome needs this. The virtual screen has no
    // window manager, so place the window to fill the browser view.
    args.push('--no-sandbox', '--window-position=0,0', '--window-size=1280,800');
  }
  args.push('https://www.twitch.tv/login');
  // Error output is kept so a browser that fails to start can say why.
  return spawn(browser, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}
