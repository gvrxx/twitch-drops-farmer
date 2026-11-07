import fs from 'node:fs';

const MAX_CLAIMS = 500;
const SAVE_EVERY_MS = 5 * 60_000;

// Drops claimed and watch time per game, kept in history.json in the data
// folder so they survive restarts.
export class History {
  claims = []; // newest first: { at, gameId, game, campaign, drop, image }
  watch = {}; // gameId -> { name, minutes }
  since = Date.now();
  #lastSave = 0;

  constructor(file) {
    this.file = file;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved.claims)) this.claims = saved.claims.slice(0, MAX_CLAIMS);
      if (saved.watch && typeof saved.watch === 'object') this.watch = saved.watch;
      if (Number.isFinite(saved.since)) this.since = saved.since;
    } catch {
      // No history yet, or an unreadable file: start fresh.
    }
  }

  addClaim(claim) {
    this.claims.unshift({ at: Date.now(), ...claim });
    this.claims.length = Math.min(this.claims.length, MAX_CLAIMS);
    this.save();
  }

  addWatch(gameId, name, minutes) {
    const entry = (this.watch[gameId] ??= { name, minutes: 0 });
    entry.name = name ?? entry.name;
    entry.minutes += minutes;
    // Watch time ticks every 30 seconds, so write it out now and then rather than each time.
    if (Date.now() - this.#lastSave > SAVE_EVERY_MS) this.save();
  }

  save() {
    this.#lastSave = Date.now();
    try {
      fs.writeFileSync(this.file, JSON.stringify({ since: this.since, claims: this.claims, watch: this.watch }, null, 2));
    } catch {
      // A failed write loses at most a few minutes of watch time; keep farming.
    }
  }

  snapshot() {
    const watch = Object.entries(this.watch)
      .map(([gameId, w]) => ({ gameId, name: w.name, minutes: Math.round(w.minutes) }))
      .filter((w) => w.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    return { since: this.since, claims: this.claims.slice(0, 50), claimCount: this.claims.length, watch };
  }
}
