import { spawn } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR, loadConfig, loadRuntime, saveConfig } from './config.js';
import { Farmer } from './farmer.js';
import { startServer } from './server.js';
import { Store } from './store.js';
import { TwitchBrowser } from './twitch.js';

const config = loadConfig();
const runtime = loadRuntime(config);
const store = new Store();
const logLines = [];
let broadcast = () => {};

function log(msg, level = 'info') {
  const line = { t: Date.now(), level, msg };
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  console.log(`[${new Date(line.t).toLocaleTimeString()}] ${msg}`);
  broadcast();
}

const browser = new TwitchBrowser({
  profileDir: path.join(DATA_DIR, 'browser-profile'),
  headless: runtime.headless,
  channel: runtime.browserChannel,
  store,
  log,
});
const loginHint = runtime.browserViewPort
  ? 'Open the browser view (button above) and log in to Twitch there. Your login is saved for next time.'
  : 'Twitch refuses logins in this automated window. Close it, run the login step (login.command or login.bat), then start the app again.';
const farmer = new Farmer({ browser, store, config, log, loginHint, onChange: () => broadcast() });
store.onChange = () => broadcast();

function snapshot() {
  const now = Date.now();
  const selected = new Map(config.games.map((g, i) => [g.id, i]));
  const gameIds = new Set([...config.games.map((g) => g.id)]);
  for (const c of store.campaigns.values()) if (c.gameId && store.isActive(c, now)) gameIds.add(c.gameId);

  const games = [...gameIds].map((id) => {
    const game = store.games.get(id) ?? config.games.find((g) => g.id === id) ?? { id };
    const campaigns = [...store.campaigns.values()]
      .filter((c) => c.gameId === id && store.isActive(c, now))
      .sort((a, b) => Date.parse(a.endAt ?? 0) - Date.parse(b.endAt ?? 0))
      .map((c) => ({
        id: c.id,
        name: c.name,
        endAt: c.endAt,
        accountConnected: c.accountConnected,
        accountLinkURL: c.accountLinkURL,
        allowedChannels: c.allow?.enabled ? c.allow.channels.length : 0,
        detailsLoaded: c.dropIds.length > 0,
        drops: store.campaignDrops(c).map((d) => ({
          id: d.id,
          name: d.benefit ?? d.name,
          image: d.image,
          current: d.current ?? 0,
          required: d.required ?? 0,
          claimed: d.claimed,
        })),
      }));
    return { id, name: game.name ?? id, boxArtURL: game.boxArtURL, priority: selected.get(id) ?? null, campaigns };
  });
  games.sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9) || a.name.localeCompare(b.name));

  const w = farmer.watching;
  return {
    phase: farmer.phase,
    message: farmer.message,
    paused: farmer.paused,
    user: store.user,
    watching: w && {
      login: w.login,
      displayName: w.displayName,
      gameId: w.gameId,
      gameName: store.games.get(w.gameId)?.name,
      campaignIds: w.campaignIds,
      since: w.since,
      videoOk: w.videoOk ?? true,
    },
    lastCampaignRefresh: farmer.lastCampaignRefresh,
    lastInventoryRefresh: farmer.lastInventoryRefresh,
    autoClaim: config.autoClaim,
    browserViewPort: runtime.browserViewPort,
    games,
    log: logLines.slice(-80),
  };
}

const actions = {
  games(body) {
    if (!Array.isArray(body.games)) throw new Error('games must be a list');
    config.games = body.games
      .filter((g) => g && typeof g.id === 'string')
      .map((g) => ({ id: g.id, name: String(g.name ?? store.games.get(g.id)?.name ?? g.id) }));
    saveConfig(config);
    log(config.games.length ? `Farming order: ${config.games.map((g) => g.name).join(' → ')}` : 'No games selected.');
    farmer.wake({ refresh: true });
  },
  autoclaim(body) {
    config.autoClaim = !!body.enabled;
    saveConfig(config);
    log(`Auto-claim ${config.autoClaim ? 'on' : 'off'}.`);
  },
  refresh() {
    farmer.wake({ refresh: true });
  },
  pause() {
    farmer.setPaused(true);
  },
  resume() {
    farmer.setPaused(false);
  },
};

({ broadcast } = startServer({ port: runtime.port, bindHost: runtime.bindHost, allowedHosts: runtime.allowedHosts, snapshot, actions }));
console.log(`Dashboard: http://${runtime.bindHost === '0.0.0.0' ? '<this machine>' : runtime.bindHost}:${runtime.port}`);
if (process.argv.includes('--open')) openInDefaultBrowser(`http://127.0.0.1:${runtime.port}`);

function openInDefaultBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

browser.on('closed', () => {
  console.log('Browser window closed. Stopping.');
  process.exit(0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await browser.close();
    process.exit(0);
  });
}

await browser.start();
farmer.run();
