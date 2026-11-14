import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Store } from '../src/store.js';

const RUST = { id: '263490', displayName: 'Rust', __typename: 'Game' };

// Shapes follow Twitch's campaigns, campaign-details and current-session responses.
function seeded() {
  const store = new Store();
  store.ingest({
    data: {
      currentUser: {
        id: '1',
        login: 'me',
        displayName: 'Me',
        dropCampaigns: [
          { id: 'c1', name: 'Rust Drops', status: 'ACTIVE', startAt: '2026-01-01T00:00:00Z', endAt: '2099-01-01T00:00:00Z', game: RUST, self: { isAccountConnected: true }, __typename: 'DropCampaign' },
          { id: 'c2', name: 'Unlinked', status: 'ACTIVE', endAt: '2099-01-01T00:00:00Z', game: RUST, self: { isAccountConnected: false }, __typename: 'DropCampaign' },
          { id: 'c3', name: 'Old', status: 'EXPIRED', endAt: '2026-02-01T00:00:00Z', game: RUST, self: { isAccountConnected: true }, __typename: 'DropCampaign' },
        ],
      },
    },
  });
  store.ingest({
    data: {
      user: {
        dropCampaign: {
          id: 'c1',
          allow: { isEnabled: true, channels: [{ id: '9', name: 'GoodStreamer', __typename: 'Channel' }] },
          timeBasedDrops: [
            { id: 'd1', name: 'Hoodie', requiredMinutesWatched: 60, benefitEdges: [{ benefit: { name: 'Hoodie', imageAssetURL: 'https://x/y.png' } }], self: { currentMinutesWatched: 20, isClaimed: false }, __typename: 'TimeBasedDrop' },
            { id: 'd2', name: 'Cap', requiredMinutesWatched: 30, self: { currentMinutesWatched: 30, isClaimed: true }, __typename: 'TimeBasedDrop' },
          ],
          __typename: 'DropCampaign',
        },
      },
    },
  });
  return store;
}

test('reads campaigns, games and drops nested under currentUser', () => {
  const store = seeded();
  assert.equal(store.user.login, 'me');
  assert.equal(store.games.get('263490').name, 'Rust');
  assert.equal(store.campaigns.get('c1').gameId, '263490');
  assert.deepEqual(store.campaigns.get('c1').dropIds, ['d1', 'd2']);
  assert.equal(store.drops.get('d1').benefit, 'Hoodie');
});

test('only active, linked campaigns with unfinished drops are farmable', () => {
  const store = seeded();
  assert.deepEqual(store.farmableCampaigns('263490').map((c) => c.id), ['c1']);
  assert.deepEqual(store.pendingDrops(store.campaigns.get('c1')).map((d) => d.id), ['d1']);
});

test('campaigns with placeholder drops still count as farmable', () => {
  const store = new Store();
  store.ingest({
    data: {
      currentUser: {
        id: '1',
        login: 'me',
        dropCampaigns: [
          { id: 'c1', status: 'ACTIVE', endAt: '2099-01-01T00:00:00Z', game: RUST, self: { isAccountConnected: true }, timeBasedDrops: [{ id: 'd1', __typename: 'TimeBasedDrop' }], __typename: 'DropCampaign' },
        ],
      },
    },
  });
  assert.deepEqual(store.farmableCampaigns('263490').map((c) => c.id), ['c1']);
});

test('channel allow-lists are matched case-insensitively', () => {
  const store = seeded();
  const c1 = store.campaigns.get('c1');
  assert.ok(store.channelAllowed(c1, 'goodstreamer'));
  assert.ok(!store.channelAllowed(c1, 'someoneelse'));
});

test('current-session and websocket progress update the drop', () => {
  const store = seeded();
  store.ingest({ data: { currentUser: { id: '1', login: 'me', dropCurrentSession: { dropID: 'd1', currentMinutesWatched: 25, requiredMinutesWatched: 60 } } } });
  assert.equal(store.drops.get('d1').current, 25);
  store.applyProgress('d1', 26, 60);
  assert.equal(store.progressSum('263490'), 56);
});

test('drops that cannot finish before the campaign ends are not pending', () => {
  const store = seeded();
  const c1 = store.campaigns.get('c1');
  c1.endAt = new Date(Date.now() + 10 * 60_000).toISOString(); // 10 min left, 40 min needed
  assert.equal(store.pendingDrops(c1).length, 0);
});

test('live streams from a drops directory listing are recorded', () => {
  const store = new Store();
  store.ingest({
    data: {
      game: {
        ...RUST,
        streams: {
          edges: [
            { node: { id: 's1', type: 'live', viewersCount: 42, broadcaster: { login: 'GoodStreamer', displayName: 'GoodStreamer' }, game: { id: '263490' }, __typename: 'Stream' } },
          ],
        },
      },
    },
  });
  assert.equal(store.streams.get('goodstreamer').viewers, 42);
});

test('category search results keep only the games section, in order', () => {
  const store = new Store();
  const game = (id, name) => ({ id, name, displayName: name, boxArtURL: `https://x/${id}.jpg`, __typename: 'Game' });
  store.ingest({
    data: {
      searchFor: {
        channels: { edges: [{ item: { login: 'someone', stream: { game: game('509658', 'Just Chatting') } } }], __typename: 'SearchForResultUsers' },
        games: { edges: [{ item: game('490744', 'Stardew Valley') }, { item: game('1390321140', 'Pico Valley') }], __typename: 'SearchForResultGames' },
      },
    },
  });
  assert.deepEqual(store.lastSearch.games.map((g) => g.name), ['Stardew Valley', 'Pico Valley']);
  assert.equal(store.games.get('490744').name, 'Stardew Valley');
});

// A finished campaign leaves the inventory's in-progress list; only the claimed
// rewards list (UserDropReward) says its drops were earned.
function finishedCampaign(rewards) {
  const store = new Store();
  store.ingest({
    data: {
      user: {
        dropCampaign: {
          id: 'e1', name: 'Done', status: 'ACTIVE', startAt: '2026-11-03T14:00:00Z', endAt: '2099-01-01T00:00:00Z',
          game: RUST, self: { isAccountConnected: true },
          timeBasedDrops: [
            { id: 'x1', name: 'Map', requiredMinutesWatched: 120, startAt: '2026-11-03T14:00:00Z', benefitEdges: [{ benefit: { id: 'b1', name: 'Map' } }], __typename: 'TimeBasedDrop' },
            { id: 'x2', name: 'Helmet', requiredMinutesWatched: 180, startAt: '2026-11-03T14:00:00Z', benefitEdges: [{ benefit: { id: 'b2', name: 'Helmet' } }], __typename: 'TimeBasedDrop' },
          ],
          __typename: 'DropCampaign',
        },
      },
    },
  });
  store.ingest({
    data: {
      currentUser: {
        inventory: {
          dropCampaignsInProgress: [],
          gameEventDropsConnection: { edges: rewards.map(([id, at]) => ({ node: { id, benefit: { id }, lastAwardedAt: at, __typename: 'UserDropReward' } })) },
        },
      },
    },
  });
  return store;
}

test('drops whose rewards are in the claimed list count as claimed after a restart', () => {
  const store = finishedCampaign([['b1', '2026-11-07T09:53:11Z'], ['b2', '2026-11-07T10:54:32Z']]);
  assert.ok(store.drops.get('x1').claimed && store.drops.get('x2').claimed);
  assert.deepEqual(store.farmableCampaigns('263490'), []);
  assert.equal(store.dormantReason('263490'), 'All drops earned');
});

test('a reward awarded before the drop started does not count as claimed', () => {
  const store = finishedCampaign([['b1', '2026-10-01T00:00:00Z'], ['b2', '2026-11-07T10:54:32Z']]);
  assert.equal(store.drops.get('x1').claimed, false);
  assert.equal(store.drops.get('x2').claimed, true);
  assert.equal(store.farmableCampaigns('263490').length, 1);
});

test("Twitch's integrity refusal of the campaigns list is recorded", () => {
  const store = new Store();
  const since = Date.now();
  store.ingest([{ errors: [{ message: 'failed integrity check', path: ['currentUser', 'dropCampaigns'], extensions: { code: 'IntegrityCheckFailed' } }], data: { currentUser: { dropCampaigns: null } } }]);
  assert.equal(store.campaignsRefusedSince(since), true);
  assert.equal(store.campaignsRefusedSince(Date.now() + 1), false);
});

test('an integrity refusal of something else does not count', () => {
  const store = new Store();
  store.ingest({ errors: [{ path: ['progress'], extensions: { code: 'IntegrityCheckFailed' } }] });
  assert.equal(store.campaignsRefusedSince(0), false);
});
