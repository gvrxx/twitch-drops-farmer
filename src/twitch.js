import { EventEmitter } from 'node:events';
import { chromium } from 'playwright';

const TWITCH = 'https://www.twitch.tv';
const GATE_BUTTONS = [
  '[data-a-target="player-overlay-mature-accept"]',
  '[data-a-target="content-classification-gate-overlay-start-watching-button"]',
].join(',');

// One persistent Chromium profile with two tabs:
//  - player: plays the stream being farmed (muted, 160p)
//  - helper: loads the drops, inventory and directory pages, with video,
//    images and fonts blocked so it never counts as a second viewer.
export class TwitchBrowser extends EventEmitter {
  #searchQueue = Promise.resolve();

  constructor({ profileDir, headless, channel, minimized, store, log }) {
    super();
    this.minimized = minimized;
    this.profileDir = profileDir;
    this.headless = headless;
    this.channel = channel; // e.g. 'chrome' to use Google Chrome instead of bundled Chromium
    this.store = store;
    this.log = log;
  }

  async start() {
    this.ctx = await chromium.launchPersistentContext(this.profileDir, {
      headless: this.headless,
      channel: this.channel || undefined,
      // The mock keychain can't read cookies saved by a normal browser sign-in (npm run login).
      ignoreDefaultArgs: ['--use-mock-keychain'],
      viewport: { width: 1100, height: 700 },
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-media-suspend',
        // Linux has no keyring in a container; keep cookies in the profile itself.
        ...(process.platform === 'linux' ? ['--password-store=basic'] : []),
      ],
    });
    this.ctx.on('close', () => {
      this.closed = true;
      this.emit('closed');
    });
    await this.ctx.addInitScript(() => {
      try {
        localStorage.setItem('video-muted', '{"default":true}');
        localStorage.setItem('video-quality', '{"default":"160p30"}');
      } catch {}
    });
    this.ctx.on('response', (res) => this.#onResponse(res));

    this.helper = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    await blockHeavyContent(this.helper);
    // Game search gets its own tab so it never has to wait for farming work.
    this.search = await this.ctx.newPage();
    await blockHeavyContent(this.search);

    // Opened last so it's the active tab without having to pull the window forward.
    this.player = await this.ctx.newPage();
    this.player.on('websocket', (ws) => ws.on('framereceived', ({ payload }) => this.#onFrame(payload)));

    if (this.minimized && !this.headless && (await this.isLoggedIn())) await this.#minimize();
  }

  // Sends the window to the Dock or taskbar. The stream keeps playing there.
  async #minimize() {
    try {
      const cdp = await this.ctx.newCDPSession(this.player);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await cdp.detach();
    } catch (err) {
      this.log(`Couldn't minimize the browser window: ${err.message}`, 'warn');
    }
  }

  async close() {
    await this.ctx?.close().catch(() => {});
  }

  async isLoggedIn() {
    const cookies = await this.ctx.cookies(TWITCH);
    return cookies.some((c) => c.name === 'auth-token' && c.value);
  }

  async openLogin() {
    await this.player.goto(`${TWITCH}/login`, { waitUntil: 'domcontentloaded' });
    await this.player.bringToFront();
  }

  // ---- helper tab ----

  async #visit(path, settleMs = 6000) {
    await this.helper.goto(TWITCH + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await this.helper.waitForLoadState('networkidle', { timeout: settleMs + 4000 }).catch(() => {});
    await this.helper.waitForTimeout(settleMs);
  }

  // Loads the campaigns page, then expands the selected games' entries so the
  // site fetches their drop lists and allowed channels.
  async loadCampaigns(gameNames) {
    await this.#visit('/drops/campaigns');
    for (const name of gameNames) {
      const headers = this.helper.locator('[aria-expanded="false"]').filter({ hasText: name });
      const count = Math.min(await headers.count().catch(() => 0), 6);
      for (let i = count - 1; i >= 0; i--) {
        await headers.nth(i).click({ timeout: 3000 }).catch(() => {});
        await this.helper.waitForTimeout(1500);
      }
    }
    await this.helper.waitForTimeout(2000);
  }

  async loadInventory() {
    await this.#visit('/drops/inventory');
  }

  // Clicks every "Claim" button on the inventory page. Returns how many were clicked.
  async claimAll() {
    await this.loadInventory();
    let claimed = 0;
    for (let i = 0; i < 25; i++) {
      const button = this.helper.getByRole('button', { name: /^claim/i }).first();
      if (!(await button.isVisible().catch(() => false))) break;
      await button.click({ timeout: 5000 }).catch(() => {});
      claimed++;
      await this.helper.waitForTimeout(2500);
    }
    if (claimed) await this.loadInventory();
    return claimed;
  }

  // Live, drops-enabled streams for a game, most viewers first.
  async findStreams(gameId) {
    const game = this.store.games.get(gameId);
    const since = Date.now();
    const path = game?.slug
      ? `/directory/category/${encodeURIComponent(game.slug)}`
      : `/directory/game/${encodeURIComponent(game?.name ?? gameId)}`;
    const query = '?filter=drops&sort=VIEWER_COUNT';
    await this.#visit(path + query, 4000);
    // /directory/game/<name> redirects to the category page and loses the query.
    const landed = new URL(this.helper.url());
    if (!landed.search.includes('filter=drops') && landed.pathname.startsWith('/directory/category/')) {
      await this.#visit(landed.pathname + query, 4000);
    }
    return [...this.store.streams.values()]
      .filter((s) => s.seenAt >= since && s.gameId === gameId)
      .sort((a, b) => b.viewers - a.viewers);
  }

  // Resolves a game's name to its Twitch id, for games with no campaign to list them.
  async lookupGame(name) {
    await this.#visit(`/directory/game/${encodeURIComponent(name)}`, 3000);
    const slug = new URL(this.helper.url()).pathname.match(/^\/directory\/category\/([^/]+)/)?.[1];
    if (!slug) return null;
    const game = [...this.store.games.values()].find((g) => g.slug === decodeURIComponent(slug));
    return game ? { id: game.id, name: game.name, boxArtURL: game.boxArtURL } : null;
  }

  // Twitch's own category search, which also finds games with no drops event.
  searchGames(term) {
    const run = this.#searchQueue.then(async () => {
      const since = Date.now();
      await this.search.goto(`${TWITCH}/search?term=${encodeURIComponent(term)}&type=categories`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (let i = 0; i < 60 && !(this.store.lastSearch?.at >= since); i++) await this.search.waitForTimeout(250);
      return this.store.lastSearch?.at >= since ? this.store.lastSearch.games.slice(0, 10) : [];
    });
    this.#searchQueue = run.catch(() => {});
    return run;
  }

  // Opens a channel page (video blocked) to see if it's live in the given game.
  async isChannelLive(login, gameId) {
    const since = Date.now();
    await this.#visit(`/${encodeURIComponent(login)}`, 3000);
    const info = this.store.channels.get(login);
    return !!info && info.seenAt >= since && info.live && (!info.gameId || info.gameId === gameId);
  }

  // Leaves Twitch's pages so nothing keeps running during a dormant wait.
  async clearHelper() {
    await this.helper.goto('about:blank').catch(() => {});
  }

  // ---- player tab ----

  async watch(login) {
    await this.player.goto(`${TWITCH}/${encodeURIComponent(login)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  }

  async stopWatching() {
    if (this.player.url() !== 'about:blank') await this.player.goto('about:blank').catch(() => {});
  }

  async reloadPlayer() {
    await this.player.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  }

  // Snapshot of the player: which channel it's on, whether video is moving,
  // and the category shown under the stream. Also clears mature-content gates
  // and resumes a paused video.
  async playerHealth() {
    return this.player.evaluate((gateSelector) => {
      document.querySelector(gateSelector)?.click();
      const video = document.querySelector('video');
      if (video?.paused) video.play().catch(() => {});
      // Collab streams add a "Streaming Together" link with the same target; skip it.
      const gameLink = document.querySelector('a[data-a-target="stream-game-link"][href^="/directory/"]');
      return {
        login: location.pathname.split('/')[1]?.toLowerCase() ?? '',
        videoTime: video?.currentTime ?? null,
        paused: video?.paused ?? true,
        pageHidden: document.hidden,
        gameHref: gameLink?.getAttribute('href') ?? null,
        gameText: gameLink?.textContent?.trim() ?? null,
      };
    }, GATE_BUTTONS);
  }

  // ---- network taps ----

  async #onResponse(res) {
    if (!res.url().startsWith('https://gql.twitch.tv/gql')) return;
    try {
      this.store.ingest(await res.json());
    } catch {
      // aborted, non-JSON or page navigated away; nothing to read
    }
  }

  #onFrame(payload) {
    if (typeof payload !== 'string' || !payload.includes('drop-')) return;
    for (const msg of findDropMessages(payload)) {
      if (msg.type === 'drop-progress' && msg.data?.drop_id) {
        this.store.applyProgress(msg.data.drop_id, msg.data.current_progress_min, msg.data.required_progress_min);
      } else if (msg.type === 'drop-claim') {
        this.emit('claimable');
      }
    }
  }
}

// Background tabs only need Twitch's data, not its video, images or fonts.
// Blocking video also keeps them from ever counting as a second viewer.
function blockHeavyContent(page) {
  return page.route('**/*', (route) => {
    const req = route.request();
    const blocked = ['image', 'media', 'font'].includes(req.resourceType()) || new URL(req.url()).hostname.endsWith('ttvnw.net');
    return blocked ? route.abort() : route.continue();
  });
}

// Websocket messages wrap JSON inside JSON strings; dig out any {type: "drop-..."} objects.
function findDropMessages(text, depth = 0) {
  const found = [];
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return found;
  }
  const visit = (node) => {
    if (typeof node === 'string') {
      if (depth < 4 && node.includes('drop-') && /^[[{]/.test(node.trim())) found.push(...findDropMessages(node, depth + 1));
    } else if (node && typeof node === 'object') {
      if (typeof node.type === 'string' && node.type.startsWith('drop-')) found.push(node);
      Object.values(node).forEach(visit);
    }
  };
  visit(value);
  return found;
}
