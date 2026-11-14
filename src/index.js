import { spawn } from 'node:child_process';
import path from 'node:path';
import { DATA_DIR, loadConfig, loadRuntime, saveConfig } from './config.js';
import { Farmer } from './farmer.js';
import { ActivityLog } from './activity.js';
import { History } from './history.js';
import { startServer } from './server.js';
import { Store } from './store.js';
import { TwitchBrowser } from './twitch.js';

const config = loadConfig();
const runtime = loadRuntime(config);
const store = new Store();
const history = new History(path.join(DATA_DIR, 'history.json'));
// Also written to activity.log, so you can see what happened while you were away or after a restart.
const activity = new ActivityLog(path.join(DATA_DIR, 'activity.log'));
const logLines = activity.recent(200);
let broadcast = () => {};

function log(msg, level = 'info') {
  const line = { t: Date.now(), level, msg };
  logLines.push(line);
  if (logLines.length > 200) logLines.shift();
  activity.append(line);
  console.log(`[${new Date(line.t).toLocaleTimeString()}] ${msg}`);
  broadcast();
}
log('App started.');

const browser = new TwitchBrowser({
  profileDir: path.join(DATA_DIR, 'browser-profile'),
  headless: runtime.headless,
  channel: runtime.browserChannel,
  // Docker's browser view needs the window on screen.
  minimized: config.minimizeBrowser && !runtime.browserViewPort,
  store,
  log,
});
const loginHint = runtime.browserViewPort
  ? 'Open the browser view (button above) and log in to Twitch there. Your login is saved for next time.'
  : 'Twitch refuses logins in this automated window. Close it, run the login step (login.command or login.bat), then start the app again.';
const gameName = (id) => store.games.get(id)?.name ?? config.games.find((g) => g.id === id)?.name ?? id;
const farmer = new Farmer({
  browser,
  store,
  config,
  log,
  loginHint,
  onChange: () => broadcast(),
  onGameFound: addGameToConfig,
  onClaim(drop, campaign) {
    const gameId = campaign?.gameId;
    history.addClaim({ gameId, game: gameName(gameId), campaign: campaign?.name, drop: drop.benefit ?? drop.name, image: drop.image });
    log(`Claimed ${drop.benefit ?? drop.name} (${gameName(gameId)}).`, 'success');
  },
  onWatch: (gameId, minutes) => history.addWatch(gameId, gameName(gameId), minutes),
});
store.onChange = () => broadcast();

// Saved with the game so games without an event keep their picture after a restart.
function boxArt(url) {
  return typeof url === 'string' && url.startsWith('https://static-cdn.jtvnw.net/') ? url : undefined;
}

function addGameToConfig(game) {
  if (config.games.some((g) => g.id === game.id)) return log(`${game.name} is already selected.`);
  config.games.push(game);
  saveConfig(config);
  log(`Added ${game.name}.`);
}

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
    const saved = config.games.find((g) => g.id === id);
    return { id, name: game.name ?? id, boxArtURL: game.boxArtURL ?? saved?.boxArtURL, priority: selected.get(id) ?? null, dormant: farmer.dormant.get(id) ?? null, campaigns };
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
      pageHidden: w.pageHidden,
    },
    campaignsRefused: farmer.campaignsRefused,
    lastCampaignRefresh: farmer.lastCampaignRefresh,
    lastInventoryRefresh: farmer.lastInventoryRefresh,
    autoClaim: config.autoClaim,
    farmOrder: config.farmOrder,
    history: history.snapshot(),
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
      .map((g) => ({ id: g.id, name: String(g.name ?? store.games.get(g.id)?.name ?? g.id), boxArtURL: boxArt(g.boxArtURL) }));
    saveConfig(config);
    log(config.games.length ? `Farming order: ${config.games.map((g) => g.name).join(' → ')}` : 'No games selected.');
    farmer.wake({ refresh: true });
  },
  async searchgames(body) {
    const term = String(body.term ?? '').trim().slice(0, 80);
    if (term.length < 2) return { games: [] };
    const games = await browser.searchGames(term);
    const words = term.split(/\s+/);
    if (games.length || words.length < 2) return { games };
    // Twitch finds nothing while the last word is half-typed ("hollow kn"),
    // so search without it and keep the names that match what was typed.
    const looser = await browser.searchGames(words.slice(0, -1).join(' '));
    return { games: looser.filter((g) => g.name.toLowerCase().includes(term.toLowerCase())) };
  },
  addgame(body) {
    const name = String(body.name ?? '').trim();
    if (!name) throw new Error('Enter a game name');
    farmer.addGame(name);
  },
  autoclaim(body) {
    config.autoClaim = !!body.enabled;
    saveConfig(config);
    log(`Auto-claim ${config.autoClaim ? 'on' : 'off'}.`);
  },
  order(body) {
    if (!['ending', 'priority'].includes(body.order)) throw new Error('order must be "ending" or "priority"');
    config.farmOrder = body.order;
    saveConfig(config);
    log(config.farmOrder === 'ending' ? 'Farming order: campaigns ending soonest first.' : 'Farming order: your game order.');
    farmer.wake();
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

const dashboardUrl = `http://127.0.0.1:${runtime.port}`;
const server = startServer({ port: runtime.port, bindHost: runtime.bindHost, allowedHosts: runtime.allowedHosts, snapshot, actions });
broadcast = server.broadcast;
try {
  await server.listening;
} catch (err) {
  if (err.code !== 'EADDRINUSE') throw err;
  // Most likely the app is already running, so point at it instead of starting a second browser.
  console.log(`Drops Farmer is already running (port ${runtime.port} is in use). Its dashboard: ${dashboardUrl}`);
  console.log('To restart it, stop the running copy first with Ctrl+C in its window.');
  if (process.argv.includes('--open')) openInDefaultBrowser(dashboardUrl);
  process.exit(1);
}
console.log(`Dashboard: http://${runtime.bindHost === '0.0.0.0' ? '<this machine>' : runtime.bindHost}:${runtime.port}`);
if (process.argv.includes('--open')) openInDefaultBrowser(dashboardUrl);

function openInDefaultBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

browser.on('closed', () => {
  history.save();
  console.log('Browser window closed. Stopping.');
  process.exit(0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    history.save();
    await browser.close();
    process.exit(0);
  });
}

await browser.start();
farmer.run();
