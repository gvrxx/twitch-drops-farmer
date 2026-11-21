import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Where config.json and the browser profile live (a mounted volume in Docker).
export const DATA_DIR = path.resolve(process.env.DATA_DIR || ROOT);
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
// The app's version, from package.json. Each release on GitHub is tagged v<version>.
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const DEFAULTS = {
  port: 8411,
  // Games to farm, highest priority first: [{ id, name }]
  games: [],
  autoClaim: true,
  headless: false,
  minimizeBrowser: true,
  inventoryRefreshMinutes: 5,
  campaignRefreshMinutes: 30,
  // Reloads the stream this often to keep the player's memory down; 0 turns it off.
  playerReloadHours: 4,
  farmOrder: 'ending', // 'ending': campaign ending soonest first; 'priority': the order of config.games
};

export function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Ignoring unreadable config.json: ${err.message}`);
  }
  return { ...DEFAULTS, ...saved };
}

// Twitch can refuse logins from the bundled Chromium, so prefer an installed
// browser: Windows 11 always has Edge, and macOS may have Chrome.
function defaultBrowserChannel() {
  if (process.platform === 'win32') return 'msedge';
  if (process.platform === 'darwin' && fs.existsSync('/Applications/Google Chrome.app')) return 'chrome';
  return '';
}

// Deployment settings from the environment. Kept apart from config.json so
// they're never written back into it.
export function loadRuntime(config) {
  const list = (v) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return {
    port: Number(process.env.PORT) || config.port,
    bindHost: process.env.BIND_HOST || '127.0.0.1',
    allowedHosts: list(process.env.ALLOWED_HOSTS),
    headless: process.env.HEADLESS ? process.env.HEADLESS === 'true' : config.headless,
    browserChannel: process.env.BROWSER_CHANNEL || defaultBrowserChannel(),
    browserViewPort: Number(process.env.BROWSER_VIEW_PORT) || null,
  };
}

export function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}
