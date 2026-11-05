const MIN = 60_000;
const HEALTH_CHECK_MS = 30_000;
const STALL_MS = 25 * MIN; // no progress for this long on a channel -> try another
const MAX_ALLOWLIST_PROBES = 8;

export class Farmer {
  paused = false;
  phase = 'starting'; // starting | login | refreshing | searching | watching | idle | paused
  message = '';
  watching = null; // { login, displayName, gameId, campaignIds, since, progressAtStart, lastVideoTime, badChecks, reloaded }
  lastCampaignRefresh = 0;
  lastInventoryRefresh = 0;
  #bad = new Map(); // login -> time until which we avoid it
  #wakeFn = null;
  #woken = false;
  #forceRefresh = true;
  #claimPending = false;

  constructor({ browser, store, config, log, loginHint, onChange }) {
    this.loginHint = loginHint;
    this.browser = browser;
    this.store = store;
    this.config = config;
    this.log = log;
    this.onChange = onChange;
    browser.on('claimable', () => {
      this.#claimPending = true;
      this.wake();
    });
  }

  // Interrupts the current wait so the loop re-plans right away.
  wake({ refresh = false } = {}) {
    if (refresh) this.#forceRefresh = true;
    this.#woken = true;
    this.#wakeFn?.();
  }

  setPaused(paused) {
    this.paused = paused;
    this.log(paused ? 'Paused.' : 'Resumed.');
    this.wake();
  }

  async run() {
    for (;;) {
      try {
        await this.#tick();
      } catch (err) {
        if (this.browser.closed) return;
        this.log(`Error: ${err.message}`, 'error');
        this.watching = null;
        await this.#sleep(30_000);
      }
    }
  }

  #setPhase(phase, message = '') {
    this.phase = phase;
    this.message = message;
    this.onChange();
  }

  // Resolves after ms, or right away once wake() has been called this tick.
  #sleep(ms) {
    if (this.#woken) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#wakeFn = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.#wakeFn = done;
    });
  }

  async #tick() {
    this.#woken = false;
    if (!(await this.browser.isLoggedIn())) await this.#waitForLogin();

    if (this.paused) {
      await this.#stopWatching();
      this.#setPhase('paused', 'Paused from the dashboard.');
      await this.#sleep(10 * MIN);
      return;
    }

    await this.#refreshIfDue();

    if (this.config.games.length === 0) {
      await this.#stopWatching();
      this.#setPhase('idle', 'Pick at least one game in the dashboard.');
      await this.#sleep(30 * MIN);
      return;
    }

    const target = await this.#pickTarget();
    if (!target) {
      await this.#stopWatching();
      this.#setPhase('idle', 'No live drops-enabled streams for your selected games right now. Checking again in 5 minutes.');
      await this.#sleep(5 * MIN);
      return;
    }

    if (this.watching?.login !== target.login) {
      this.log(`Watching ${target.displayName} for ${this.#gameName(target.gameId)}.`);
      await this.browser.watch(target.login);
      this.watching = {
        ...target,
        since: Date.now(),
        progressAtStart: this.store.progressSum(target.gameId),
        lastVideoTime: null,
        badChecks: 0,
        reloaded: false,
      };
    } else {
      this.watching.campaignIds = target.campaignIds;
    }
    this.#setPhase('watching');
    await this.#watchUntilNextRefresh();
  }

  async #waitForLogin() {
    this.watching = null;
    this.#setPhase('login', this.loginHint);
    this.log('Not logged in. Waiting for you to log in to Twitch.');
    await this.browser.openLogin();
    while (!(await this.browser.isLoggedIn())) await new Promise((r) => setTimeout(r, 3000));
    this.log('Logged in.');
    this.#forceRefresh = true;
    await this.browser.stopWatching();
  }

  async #refreshIfDue() {
    const now = Date.now();
    const force = this.#forceRefresh;
    this.#forceRefresh = false;

    if (force || now - this.lastCampaignRefresh > this.config.campaignRefreshMinutes * MIN) {
      this.#setPhase('refreshing', 'Loading drop campaigns…');
      await this.browser.loadCampaigns(this.config.games.map((g) => g.name));
      this.lastCampaignRefresh = Date.now();
      this.log(`Loaded ${this.store.campaigns.size} campaigns.`);
    }
    if (force || this.#claimPending || now - this.lastInventoryRefresh > this.config.inventoryRefreshMinutes * MIN) {
      this.#claimPending = false;
      this.#setPhase('refreshing', 'Checking your drops inventory…');
      if (this.config.autoClaim) {
        const claimed = await this.browser.claimAll();
        if (claimed) this.log(`Claimed ${claimed} drop${claimed > 1 ? 's' : ''}.`, 'success');
      } else {
        await this.browser.loadInventory();
      }
      this.lastInventoryRefresh = Date.now();
    }
    if (this.phase === 'refreshing') this.#setPhase(this.watching ? 'watching' : 'searching');
  }

  // Highest-priority game with something to earn and a live eligible channel.
  // Keeps the current channel when it's still a valid choice for that game.
  async #pickTarget() {
    for (const { id: gameId } of this.config.games) {
      const campaigns = this.store.farmableCampaigns(gameId);
      if (campaigns.length === 0) continue;
      const eligibleFor = (login) => campaigns.filter((c) => this.store.channelAllowed(c, login)).map((c) => c.id);

      const current = this.watching;
      if (current?.gameId === gameId && !this.#isBad(current.login) && eligibleFor(current.login).length) {
        return { ...current, campaignIds: eligibleFor(current.login) };
      }

      this.#setPhase('searching', `Looking for a live stream for ${this.#gameName(gameId)}…`);
      const streams = (await this.browser.findStreams(gameId)).filter((s) => !this.#isBad(s.login));
      const ranked = streams
        .map((s) => ({ ...s, campaignIds: eligibleFor(s.login) }))
        .filter((s) => s.campaignIds.length)
        .sort((a, b) => b.campaignIds.length - a.campaignIds.length || b.viewers - a.viewers);
      if (ranked.length) return { login: ranked[0].login, displayName: ranked[0].displayName, gameId, campaignIds: ranked[0].campaignIds };

      // Allow-listed campaigns often use small channels that don't make the
      // directory's first page, so check a few of them directly.
      const listed = [...new Set(campaigns.filter((c) => c.allow?.enabled).flatMap((c) => c.allow.channels))]
        .filter((login) => !this.#isBad(login))
        .slice(0, MAX_ALLOWLIST_PROBES);
      for (const login of listed) {
        if (await this.browser.isChannelLive(login, gameId)) {
          return { login, displayName: login, gameId, campaignIds: eligibleFor(login) };
        }
      }
    }
    return null;
  }

  async #watchUntilNextRefresh() {
    const deadline = Date.now() + this.config.inventoryRefreshMinutes * MIN;
    while (Date.now() < deadline) {
      await this.#sleep(HEALTH_CHECK_MS);
      if (this.#woken) return;
      if (!(await this.#checkPlayer())) return;
    }
    this.#checkStall();
  }

  // Returns false when we should stop watching this channel and re-plan.
  async #checkPlayer() {
    const w = this.watching;
    const health = await this.browser.playerHealth();
    w.lastCheck = Date.now();

    if (health.login !== w.login) {
      this.log(`Player left ${w.displayName} (raid or redirect to /${health.login}).`);
      this.watching = null;
      return false;
    }

    const game = this.store.games.get(w.gameId);
    const slugMatches = game?.slug && health.gameHref?.endsWith(`/${game.slug}`);
    const nameMatches = game?.name && health.gameText?.toLowerCase() === game.name.toLowerCase();
    if (health.gameHref && !slugMatches && !nameMatches) {
      this.#markBad(w.login, 15, `${w.displayName} switched to ${health.gameText}`);
      return false;
    }

    const moving = health.videoTime != null && w.lastVideoTime != null && health.videoTime > w.lastVideoTime + 1;
    w.videoOk = moving || w.lastVideoTime == null;
    w.lastVideoTime = health.videoTime;
    w.badChecks = moving ? 0 : w.badChecks + 1;
    this.onChange();
    if (w.badChecks >= 4) {
      if (!w.reloaded) {
        this.log(`Video on ${w.displayName} seems stuck, reloading.`, 'warn');
        w.reloaded = true;
        w.badChecks = 0;
        w.lastVideoTime = null;
        await this.browser.reloadPlayer();
      } else {
        this.#markBad(w.login, 15, `Video on ${w.displayName} isn't playing (offline?)`);
        return false;
      }
    }
    return true;
  }

  #checkStall() {
    const w = this.watching;
    if (!w || Date.now() - w.since < STALL_MS || this.lastInventoryRefresh < w.since + STALL_MS - 5 * MIN) return;
    const known = w.campaignIds.some((id) => this.store.campaigns.get(id)?.dropIds.length);
    if (known && this.store.progressSum(w.gameId) <= w.progressAtStart) {
      this.#markBad(w.login, 60, `No drop progress after ${Math.round((Date.now() - w.since) / MIN)} min on ${w.displayName}`);
    } else {
      w.since = Date.now();
      w.progressAtStart = this.store.progressSum(w.gameId);
    }
  }

  #markBad(login, minutes, reason) {
    this.#bad.set(login, Date.now() + minutes * MIN);
    this.log(`${reason}; skipping it for ${minutes} min.`, 'warn');
    if (this.watching?.login === login) this.watching = null;
  }

  #isBad(login) {
    const until = this.#bad.get(login);
    return until != null && until > Date.now();
  }

  async #stopWatching() {
    if (!this.watching) return;
    this.log(`Stopped watching ${this.watching.displayName}.`);
    this.watching = null;
    await this.browser.stopWatching();
  }

  #gameName(gameId) {
    return this.store.games.get(gameId)?.name ?? this.config.games.find((g) => g.id === gameId)?.name ?? gameId;
  }
}
