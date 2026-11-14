import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Farmer } from '../src/farmer.js';
import { Store } from '../src/store.js';

const until = async (check) => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(check(), 'condition not reached');
};

// A browser stand-in where the campaigns page shows whatever `listing` holds.
function setup({ listing, games = [{ id: 'g1', name: 'Quiet Game' }], streams = [], playerReloadHours = 4, farmOrder, onClaim, refuse = false }) {
  const store = new Store();
  const browser = new EventEmitter();
  const calls = { campaigns: 0, reloads: 0 };
  let videoTime = 0;
  Object.assign(browser, {
    closed: false,
    listing,
    async isLoggedIn() {
      if (browser.closed) throw new Error('closed');
      return true;
    },
    async loadCampaigns() {
      calls.campaigns++;
      if (browser.refuse) {
        store.ingest({ errors: [{ path: ['currentUser', 'dropCampaigns'], extensions: { code: 'IntegrityCheckFailed' } }], data: { currentUser: { dropCampaigns: null } } });
        return;
      }
      store.ingest({ data: { currentUser: { id: '1', login: 'me', dropCampaigns: browser.listing } } });
    },
    // The inventory page, when a test sets one.
    claimAll: async () => {
      if (browser.inventory) store.ingest(browser.inventory);
      return 0;
    },
    loadInventory: async () => {},
    findStreams: async (gameId) => (typeof streams === 'function' ? streams(gameId) : streams),
    isChannelLive: async () => false,
    stopWatching: async () => {},
    clearHelper: async () => {},
    watch: async () => {},
    playerHealth: async () => ({ login: 'streamer', videoTime: (videoTime += 30), gameHref: null }),
    reloadPlayer: async () => {
      calls.reloads++;
    },
  });
  const config = { games, autoClaim: true, inventoryRefreshMinutes: 5, campaignRefreshMinutes: 30, playerReloadHours, farmOrder };
  const farmer = new Farmer({ browser, store, config, log: (m) => process.env.DEBUG_FARMER && console.log('LOG', new Date().toISOString(), m), onChange: () => {}, onGameFound: () => {}, onClaim });
  const stop = async () => {
    browser.closed = true;
    farmer.wake();
    await running;
  };
  const logs = [];
  farmer.log = (m, level) => logs.push({ m, level });
  browser.refuse = refuse;
  const running = farmer.run();
  return { farmer, browser, calls, stop, logs };
}

const other = { id: 'c9', status: 'ACTIVE', endAt: '2099-01-01T00:00:00Z', game: { id: 'other', displayName: 'Other', __typename: 'Game' }, self: { isAccountConnected: true }, __typename: 'DropCampaign' };
const event = { ...other, id: 'c1', game: { id: 'g1', displayName: 'Quiet Game', __typename: 'Game' } };

test('a selected game with no event goes dormant for 3 days', async () => {
  const { farmer, stop } = setup({ listing: [other] });
  await until(() => farmer.phase === 'dormant');
  const { reason, nextCheckAt } = farmer.dormant.get('g1');
  assert.equal(reason, 'No active event');
  assert.ok(Math.abs(nextCheckAt - Date.now() - 72 * 3600_000) < 60_000);
  await stop();
});

test('a dormant wait makes no Twitch requests until the recheck is due', async () => {
  const { farmer, calls, stop } = setup({ listing: [other] });
  await until(() => farmer.phase === 'dormant');
  const before = calls.campaigns;
  farmer.wake();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(calls.campaigns, before);
  await stop();
});

test('a due recheck that finds an event wakes the game', async () => {
  const { farmer, browser, calls, stop } = setup({ listing: [other] });
  await until(() => farmer.phase === 'dormant');
  const before = calls.campaigns;
  browser.listing = [other, event];
  farmer.dormant.get('g1').nextCheckAt = Date.now() - 1;
  farmer.wake();
  await until(() => calls.campaigns > before && !farmer.dormant.has('g1'));
  await stop();
});

test('a failed campaigns load does not make games dormant', async () => {
  const { farmer, stop } = setup({ listing: [] });
  await until(() => farmer.phase === 'idle');
  assert.equal(farmer.dormant.size, 0);
  await stop();
});

test('a dormant game wakes for an announced campaign before the 3-day recheck', async () => {
  const startAt = new Date(Date.now() + 3600_000).toISOString();
  const upcoming = { ...event, status: 'UPCOMING', startAt };
  const { farmer, stop } = setup({ listing: [other, upcoming] });
  await until(() => farmer.phase === 'dormant');
  assert.ok(farmer.dormant.get('g1').nextCheckAt < Date.now() + 2 * 3600_000);
  await stop();
});

// Moves the clock forward in 30-second steps, the player's health check interval.
async function advance(t, minutes) {
  for (let i = 0; i < minutes * 2; i++) {
    t.mock.timers.tick(30_000);
    for (let j = 0; j < 4; j++) await new Promise((r) => setImmediate(r));
  }
}

const stream = { login: 'streamer', displayName: 'Streamer', viewers: 5 };

test('the stream reloads once the reload interval has passed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const { farmer, calls, stop } = setup({ listing: [event], streams: [stream], playerReloadHours: 1 });
  for (let i = 0; i < 20 && farmer.phase !== 'watching'; i++) await new Promise((r) => setImmediate(r));
  assert.equal(farmer.phase, 'watching');

  await advance(t, 58);
  assert.equal(calls.reloads, 0);
  await advance(t, 4);
  assert.equal(calls.reloads, 1);
  assert.equal(farmer.watching.login, 'streamer');
  await advance(t, 62);
  assert.equal(calls.reloads, 2);
  await stop();
});

test('setting the reload interval to 0 turns it off', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const { farmer, calls, stop } = setup({ listing: [event], streams: [stream], playerReloadHours: 0 });
  for (let i = 0; i < 20 && farmer.phase !== 'watching'; i++) await new Promise((r) => setImmediate(r));
  await advance(t, 120);
  assert.equal(calls.reloads, 0);
  await stop();
});

test('time asleep does not count as a channel giving no progress', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  const withDrops = { ...event, timeBasedDrops: [{ id: 'd1', requiredMinutesWatched: 600, self: { currentMinutesWatched: 0 }, __typename: 'TimeBasedDrop' }] };
  const { farmer, stop } = setup({ listing: [withDrops], streams: [stream], playerReloadHours: 0 });
  for (let i = 0; i < 20 && farmer.phase !== 'watching'; i++) await new Promise((r) => setImmediate(r));
  assert.equal(farmer.watching?.login, 'streamer');

  t.mock.timers.tick(70 * 60_000); // the computer sleeps for 70 minutes
  for (let j = 0; j < 4; j++) await new Promise((r) => setImmediate(r));
  await advance(t, 10);
  assert.equal(farmer.watching?.login, 'streamer');
  await stop();
});

// Two selected games, each with a live stream; 'late' is first in the dashboard order.
function twoGames(farmOrder) {
  const camp = (id, endAt) => ({ id: `c-${id}`, status: 'ACTIVE', endAt, game: { id, displayName: id, __typename: 'Game' }, self: { isAccountConnected: true }, __typename: 'DropCampaign' });
  return setup({
    listing: [camp('late', '2099-01-01T00:00:00Z'), camp('soon', '2090-01-01T00:00:00Z')],
    games: [{ id: 'late', name: 'late' }, { id: 'soon', name: 'soon' }],
    streams: (gameId) => [{ login: `${gameId}-streamer`, displayName: gameId, viewers: 5 }],
    farmOrder,
  });
}

test('the campaign ending soonest is farmed first', async () => {
  const { farmer, stop } = twoGames('ending');
  await until(() => farmer.phase === 'watching');
  assert.equal(farmer.watching.gameId, 'soon');
  await stop();
});

test('"my order" farms the games in the dashboard order', async () => {
  const { farmer, stop } = twoGames('priority');
  await until(() => farmer.phase === 'watching');
  assert.equal(farmer.watching.gameId, 'late');
  await stop();
});

test('drops claimed while running are reported once; earlier claims are not', async () => {
  const drop = (id, self) => ({ id, name: id, requiredMinutesWatched: 30, self, __typename: 'TimeBasedDrop' });
  const listing = [{ ...event, timeBasedDrops: [drop('old', { currentMinutesWatched: 30 }), drop('new', { currentMinutesWatched: 30 })] }];
  const inventory = (claimedNew) => ({
    data: { currentUser: { inventory: { dropCampaignsInProgress: [{ id: 'c1', timeBasedDrops: [drop('old', { isClaimed: true }), drop('new', { isClaimed: claimedNew })] }] } } },
  });
  const claims = [];
  const { farmer, browser, stop } = setup({ listing, onClaim: (d) => claims.push(d.id) });
  browser.inventory = inventory(false);
  await until(() => farmer.lastInventoryRefresh > 0);
  assert.deepEqual(claims, []);

  browser.inventory = inventory(true);
  const before = farmer.lastInventoryRefresh;
  farmer.wake({ refresh: true });
  await until(() => farmer.lastInventoryRefresh > before);
  farmer.wake({ refresh: true });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(claims, ['new']);
  await stop();
});

test('a refused campaigns list shows as blocked, not as no live streams', async () => {
  const { farmer, logs, stop } = setup({ listing: [event], refuse: true });
  await until(() => farmer.phase === 'blocked');
  assert.equal(farmer.campaignsRefused, true);
  assert.match(farmer.message, /integrity check/);
  assert.equal(farmer.dormant.size, 0);
  assert.equal(logs.filter((l) => /refused/.test(l.m)).length, 1);
  await stop();
});

test('farming resumes once Twitch sends the campaigns again', async () => {
  const { farmer, browser, logs, stop } = setup({ listing: [event], streams: [stream], refuse: true });
  await until(() => farmer.phase === 'blocked');
  browser.refuse = false;
  farmer.wake({ refresh: true });
  await until(() => farmer.phase === 'watching');
  assert.equal(farmer.campaignsRefused, false);
  assert.ok(logs.some((l) => /sending drop campaigns again/.test(l.m)));
  await stop();
});
