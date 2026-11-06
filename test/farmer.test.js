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
function setup({ listing, games = [{ id: 'g1', name: 'Quiet Game' }] }) {
  const store = new Store();
  const browser = new EventEmitter();
  const calls = { campaigns: 0 };
  Object.assign(browser, {
    closed: false,
    listing,
    async isLoggedIn() {
      if (browser.closed) throw new Error('closed');
      return true;
    },
    async loadCampaigns() {
      calls.campaigns++;
      store.ingest({ data: { currentUser: { id: '1', login: 'me', dropCampaigns: browser.listing } } });
    },
    claimAll: async () => 0,
    loadInventory: async () => {},
    findStreams: async () => [],
    isChannelLive: async () => false,
    stopWatching: async () => {},
    clearHelper: async () => {},
    watch: async () => {},
    playerHealth: async () => ({ login: 'streamer', videoTime: 1, gameHref: null }),
  });
  const config = { games, autoClaim: true, inventoryRefreshMinutes: 5, campaignRefreshMinutes: 30 };
  const farmer = new Farmer({ browser, store, config, log: () => {}, onChange: () => {}, onGameFound: () => {} });
  const stop = async () => {
    browser.closed = true;
    farmer.wake();
    await running;
  };
  const running = farmer.run();
  return { farmer, browser, calls, stop };
}

const other = { id: 'c9', status: 'ACTIVE', endAt: '2099-01-01T00:00:00Z', game: { id: 'other', displayName: 'Other', __typename: 'Game' }, self: { isAccountConnected: true }, __typename: 'DropCampaign' };
const event = { ...other, id: 'c1', game: { id: 'g1', displayName: 'Quiet Game', __typename: 'Game' } };

test('a selected game with no event goes dormant for 24 hours', async () => {
  const { farmer, stop } = setup({ listing: [other] });
  await until(() => farmer.phase === 'dormant');
  const { reason, nextCheckAt } = farmer.dormant.get('g1');
  assert.equal(reason, 'No active event');
  assert.ok(Math.abs(nextCheckAt - Date.now() - 24 * 3600_000) < 60_000);
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

test('a dormant game wakes for an announced campaign before 24 hours', async () => {
  const startAt = new Date(Date.now() + 3600_000).toISOString();
  const upcoming = { ...event, status: 'UPCOMING', startAt };
  const { farmer, stop } = setup({ listing: [other, upcoming] });
  await until(() => farmer.phase === 'dormant');
  assert.ok(farmer.dormant.get('g1').nextCheckAt < Date.now() + 2 * 3600_000);
  await stop();
});
