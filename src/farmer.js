const MIN = 60_000;
const HEALTH_CHECK_MS = 30_000;
const STALL_MS = 25 * MIN; // no progress for this long on a channel -> try another
const MAX_ALLOWLIST_PROBES = 8;
const DORMANT_RECHECK_MS = 3 * 24 * 60 * MIN;
const DORMANT_POLL_MS = 60 * MIN; // wakes hourly so a sleeping computer can't stretch the wait
const CAMPAIGN_START_GRACE_MS = 5 * MIN; // lets Twitch mark a new campaign active

export class Farmer {
  paused = false;
  phase = 'starting'; // starting | login | refreshing | searching | watching | idle | dormant | paused
  message = '';
  watching = null; // { login, displayName, gameId, campaignIds, since, stallSince, progressAtStart, lastVideoTime, badChecks, reloaded }
  lastCampaignRefresh = 0;
  lastInventoryRefresh = 0;
  dormant = new Map(); // gameId -> { reason, nextCheckAt } for selected games with nothing to farm
  #bad = new Map(); // login -> time until which we avoid it
  #wakeFn = null;
  #woken = false;
  #forceRefresh = true;
  #claimPending = false;
  #gameLookups = []; // names waiting to be resolved in the helper tab
  #unclaimed = null; // ids of drops known to be unclaimed at the last inventory check

  constructor({ browser, store, config, log, loginHint, onChange, onGameFound, onClaim = () => {}, onWatch = () => {} }) {
    this.loginHint = loginHint;
    this.onGameFound = onGameFound;
    this.onClaim = onClaim; // (drop, campaign) for each newly claimed drop
    this.onWatch = onWatch; // (gameId, minutes) of video that actually played
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

  // Queued because the helper tab can only do one thing at a time.
  addGame(name) {
    this.#gameLookups.push(name);
    this.wake();
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
        // Usually the computer sleeping or the connection dropping; it recovers on its own.
        const offline = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_|Timeout \d+ms exceeded/.test(err.message);
        if (offline) this.log("Couldn't reach Twitch (computer asleep or connection down). Retrying in 30 seconds.", 'warn');
        else this.log(`Error: ${err.message}`, 'error');
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
    await this.#resolveGameLookups();

    if (this.paused) {
      await this.#stopWatching();
      this.#setPhase('paused', 'Paused from the dashboard.');
      await this.#sleep(10 * MIN);
      return;
    }

    const forced = await this.#refreshIfDue();

    if (this.config.games.length === 0) {
      await this.#stopWatching();
      this.#setPhase('idle', 'Pick at least one game in the dashboard.');
      await this.#sleep(30 * MIN);
      return;
    }

    this.#updateDormant(forced);
    const target = await this.#pickTarget();
    if (!target) {
      await this.#stopWatching();
      if (this.#allDormant()) {
        await this.browser.clearHelper();
        const next = this.#nextDormantCheck();
        this.#setPhase('dormant', `Your selected games have no drops to earn right now. Next check: ${formatTime(next)}.`);
        await this.#sleep(Math.min(DORMANT_POLL_MS, next - Date.now()));
        return;
      }
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
        stallSince: Date.now(),
        loadedAt: Date.now(),
        lastCheck: Date.now(),
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

  async #resolveGameLookups() {
    while (this.#gameLookups.length) {
      const name = this.#gameLookups.shift();
      this.#setPhase('searching', `Looking up ${name}…`);
      const game = await this.browser.lookupGame(name);
      if (game) {
        this.onGameFound(game);
        this.#forceRefresh = true;
      } else {
        this.log(`Couldn't find "${name}" on Twitch. Use the game's exact name from its Twitch category page.`, 'warn');
      }
    }
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

  // Returns true when this refresh was requested rather than scheduled.
  async #refreshIfDue() {
    const now = Date.now();
    const dormantUntil = this.#allDormant() ? this.#nextDormantCheck() : null;
    if (dormantUntil && now < dormantUntil && !this.#forceRefresh && !this.#claimPending) return false;
    const force = this.#forceRefresh || dormantUntil != null;
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
      let clicked = 0;
      if (this.config.autoClaim) clicked = await this.browser.claimAll();
      else await this.browser.loadInventory();
      this.lastInventoryRefresh = Date.now();
      // Named claims are logged through onClaim; this covers any it couldn't match.
      const named = this.#recordClaims();
      if (clicked > named) this.log(`Claimed ${clicked} drop${clicked > 1 ? 's' : ''}.`, 'success');
    }
    if (this.phase === 'refreshing') this.#setPhase(this.watching ? 'watching' : 'searching');
    return force;
  }

  // Marks selected games with nothing to farm as dormant, and wakes any that
  // have drops again. A forced refresh counts as a recheck of dormant games.
  #updateDormant(forced) {
    const now = Date.now();
    const selected = new Set(this.config.games.map((g) => g.id));
    for (const id of this.dormant.keys()) if (!selected.has(id)) this.dormant.delete(id);
    // No campaigns at all means the page didn't load properly, not that there are no events.
    if (this.store.campaigns.size === 0) return;

    for (const id of selected) {
      const entry = this.dormant.get(id);
      if (this.store.farmableCampaigns(id, now).length) {
        if (entry) this.log(`${this.#gameName(id)} has drops available again.`, 'success');
        this.dormant.delete(id);
        continue;
      }
      if (entry && !forced && now < entry.nextCheckAt) continue;
      const start = this.store.nextCampaignStart(id, now);
      const nextCheckAt = Math.min(now + DORMANT_RECHECK_MS, start ? start + CAMPAIGN_START_GRACE_MS : Infinity);
      const reason = this.store.dormantReason(id, now);
      this.dormant.set(id, { reason, nextCheckAt });
      // Rechecks that change nothing stay quiet; the dashboard shows the next check time.
      if (entry?.reason !== reason) this.log(`${this.#gameName(id)} is dormant (${reason}). Next check: ${formatTime(nextCheckAt)}.`);
    }
    this.onChange();
  }

  // Reports drops that were unclaimed at the previous inventory check and are
  // claimed now, whether the app or you claimed them. The first check only
  // takes stock, so drops claimed before the app started aren't reported.
  // Returns how many it reported.
  #recordClaims() {
    const drops = [...this.store.drops.values()];
    let reported = 0;
    if (this.#unclaimed) {
      for (const d of drops) {
        if (!d.claimed || !this.#unclaimed.has(d.id)) continue;
        this.onClaim(d, this.store.campaigns.get(d.campaignId));
        reported++;
      }
    }
    this.#unclaimed = new Set(drops.filter((d) => !d.claimed && d.required != null).map((d) => d.id));
    return reported;
  }

  // Selected games in the order to try them. With farmOrder 'ending', the game
  // whose next campaign ends soonest comes first; the dashboard order breaks ties.
  #gameOrder() {
    const games = this.config.games.map((g) => g.id);
    if (this.config.farmOrder === 'priority') return games;
    const soonest = (id) => Math.min(...this.store.farmableCampaigns(id).map((c) => Date.parse(c.endAt ?? '') || Infinity), Infinity);
    const ends = new Map(games.map((id) => [id, soonest(id)]));
    return games.sort((a, b) => ends.get(a) - ends.get(b) || 0); // Infinity - Infinity is NaN
  }

  #allDormant() {
    return this.config.games.length > 0 && this.config.games.every((g) => this.dormant.has(g.id));
  }

  #nextDormantCheck() {
    return Math.min(...[...this.dormant.values()].map((d) => d.nextCheckAt));
  }

  // First game (see #gameOrder) with something to earn and a live eligible
  // channel. Keeps the current channel when it's still a valid choice for that game.
  async #pickTarget() {
    for (const gameId of this.#gameOrder()) {
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
      await this.#reloadPlayerIfDue();
    }
    this.#checkStall();
  }

  // Twitch's player can use more memory the longer it runs, so start it fresh now and then.
  async #reloadPlayerIfDue() {
    const w = this.watching;
    const everyMs = this.config.playerReloadHours * 60 * MIN;
    if (!everyMs || Date.now() - w.loadedAt < everyMs) return;
    this.log(`Reloading the stream on ${w.displayName} to free up memory.`);
    w.loadedAt = Date.now();
    w.lastVideoTime = null;
    w.badChecks = 0;
    w.reloaded = false;
    await this.browser.reloadPlayer();
  }

  // Returns false when we should stop watching this channel and re-plan.
  async #checkPlayer() {
    const w = this.watching;
    const health = await this.browser.playerHealth();
    const gap = Date.now() - w.lastCheck;
    // A long gap between checks means the computer was asleep. That time
    // earned nothing, so it mustn't count against the channel.
    const slept = gap > 4 * HEALTH_CHECK_MS;
    if (slept) {
      w.stallSince = Date.now();
      w.progressAtStart = this.store.progressSum(w.gameId);
      w.lastVideoTime = null;
      w.badChecks = 0;
    }
    w.lastCheck = Date.now();
    w.pageHidden = health.pageHidden;

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
    if (moving && !slept) this.onWatch(w.gameId, gap / MIN);
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
    if (!w || Date.now() - w.stallSince < STALL_MS || this.lastInventoryRefresh < w.stallSince + STALL_MS - 5 * MIN) return;
    const known = w.campaignIds.some((id) => this.store.campaigns.get(id)?.dropIds.length);
    if (known && this.store.progressSum(w.gameId) <= w.progressAtStart) {
      this.#markBad(w.login, 60, `No drop progress after ${Math.round((Date.now() - w.stallSince) / MIN)} min on ${w.displayName}`);
    } else {
      w.stallSince = Date.now();
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

function formatTime(ms) {
  return new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
