// Collects Drops data out of the GraphQL responses that Twitch's own web pages
// make. We never call Twitch's private API ourselves; we only read what the
// site already loads, matching objects by their __typename so that renamed
// operations or reshuffled queries keep working.

export class Store {
  campaigns = new Map(); // id -> campaign
  drops = new Map(); // id -> drop
  games = new Map(); // id -> { id, name, slug, boxArtURL }
  streams = new Map(); // login -> live stream seen in a directory listing
  channels = new Map(); // login -> { live, gameId, seenAt } from a channel page
  user = null;
  onChange = () => {};

  ingest(json) {
    this.#walk(json, null);
    this.onChange();
  }

  // Live progress pushed over the player page's websocket.
  applyProgress(dropId, current, required) {
    const drop = this.drops.get(dropId);
    if (!drop) return false;
    drop.current = Math.max(drop.current ?? 0, current);
    if (required) drop.required = required;
    this.onChange();
    return true;
  }

  #walk(node, campaignId) {
    if (Array.isArray(node)) {
      for (const item of node) this.#walk(item, campaignId);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const type = node.__typename;
    if (node.currentUser?.id && node.currentUser.login) {
      const u = node.currentUser;
      this.user = { id: u.id, login: u.login, displayName: u.displayName ?? (this.user?.id === u.id ? this.user.displayName : u.login) };
    }
    if (node.id && (type === 'DropCampaign' || 'timeBasedDrops' in node)) {
      this.#mergeCampaign(node);
      campaignId = node.id;
    } else if (node.id && (type === 'TimeBasedDrop' || 'requiredMinutesWatched' in node)) {
      this.#mergeDrop(node, campaignId ?? node.campaign?.id);
    } else if ('dropID' in node && 'currentMinutesWatched' in node) {
      // DropCurrentSession: progress for the drop being earned on this channel.
      if (node.dropID) this.applyProgress(node.dropID, node.currentMinutesWatched, node.requiredMinutesWatched);
    } else if (type === 'Game' && node.id) {
      this.#mergeGame(node);
    } else if (type === 'Stream' && node.broadcaster?.login && node.type === 'live') {
      this.streams.set(node.broadcaster.login.toLowerCase(), {
        login: node.broadcaster.login.toLowerCase(),
        displayName: node.broadcaster.displayName ?? node.broadcaster.login,
        viewers: node.viewersCount ?? 0,
        gameId: node.game?.id ?? null,
        seenAt: Date.now(),
      });
    } else if (node.login && 'stream' in node) {
      const login = node.login.toLowerCase();
      const prev = this.channels.get(login);
      this.channels.set(login, {
        live: !!node.stream,
        gameId: node.stream?.game?.id ?? (node.stream ? prev?.gameId ?? null : null),
        seenAt: Date.now(),
      });
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'timeBasedDrops') continue;
      if (value && typeof value === 'object') this.#walk(value, campaignId);
    }
  }

  #mergeGame(g) {
    const prev = this.games.get(g.id) ?? { id: g.id };
    this.games.set(g.id, {
      ...prev,
      name: g.displayName ?? g.name ?? prev.name,
      slug: g.slug ?? prev.slug,
      boxArtURL: g.boxArtURL ?? g.avatarURL ?? prev.boxArtURL,
    });
  }

  #mergeCampaign(c) {
    const prev = this.campaigns.get(c.id) ?? { id: c.id, dropIds: [] };
    const next = { ...prev };
    for (const key of ['name', 'status', 'startAt', 'endAt', 'accountLinkURL', 'imageURL', 'detailsURL']) {
      if (c[key] !== undefined) next[key] = c[key];
    }
    if (c.game?.id) {
      this.#mergeGame(c.game);
      next.gameId = c.game.id;
    }
    if (c.self && 'isAccountConnected' in c.self) next.accountConnected = c.self.isAccountConnected;
    if (c.allow !== undefined) {
      const channels = c.allow?.channels ?? [];
      next.allow = {
        enabled: !!c.allow?.isEnabled && channels.length > 0,
        channels: channels.map((ch) => (ch.name ?? ch.login ?? '').toLowerCase()).filter(Boolean),
      };
    }
    if (Array.isArray(c.timeBasedDrops)) {
      next.dropIds = c.timeBasedDrops.map((d) => d.id);
      for (const d of c.timeBasedDrops) this.#mergeDrop(d, c.id);
    }
    this.campaigns.set(c.id, next);
  }

  #mergeDrop(d, campaignId) {
    const prev = this.drops.get(d.id) ?? { id: d.id, current: 0, claimed: false };
    const benefit = d.benefitEdges?.[0]?.benefit;
    const next = {
      ...prev,
      campaignId: campaignId ?? prev.campaignId,
      name: d.name ?? prev.name,
      required: d.requiredMinutesWatched ?? prev.required,
      startAt: d.startAt ?? prev.startAt,
      endAt: d.endAt ?? prev.endAt,
      benefit: benefit?.name ?? prev.benefit,
      image: benefit?.imageAssetURL ?? prev.image,
    };
    if (d.self) {
      next.current = d.self.currentMinutesWatched ?? next.current;
      next.claimed = d.self.isClaimed ?? next.claimed;
      next.instanceId = d.self.dropInstanceID ?? next.instanceId;
    }
    this.drops.set(d.id, next);
    if (next.campaignId) {
      const campaign = this.campaigns.get(next.campaignId);
      if (campaign && !campaign.dropIds.includes(d.id)) campaign.dropIds.push(d.id);
    }
  }

  // ---- derived views ----

  campaignDrops(campaign) {
    return campaign.dropIds.map((id) => this.drops.get(id)).filter(Boolean);
  }

  isActive(campaign, now = Date.now()) {
    if (campaign.status && campaign.status !== 'ACTIVE') return false;
    if (campaign.startAt && Date.parse(campaign.startAt) > now) return false;
    if (campaign.endAt && Date.parse(campaign.endAt) <= now) return false;
    return true;
  }

  // Drops that more watching can still finish before they expire.
  pendingDrops(campaign, now = Date.now()) {
    const campaignEnd = campaign.endAt ? Date.parse(campaign.endAt) : Infinity;
    return this.campaignDrops(campaign).filter((d) => {
      if (d.claimed || d.required == null || d.current >= d.required) return false;
      const end = Math.min(d.endAt ? Date.parse(d.endAt) : Infinity, campaignEnd);
      return (end - now) / 60000 >= d.required - d.current;
    });
  }

  // Active, linked campaigns for a game that still have something to earn.
  // Campaigns whose drop list we haven't seen yet count as farmable.
  farmableCampaigns(gameId, now = Date.now()) {
    return [...this.campaigns.values()]
      .filter((c) => c.gameId === gameId && this.isActive(c, now) && c.accountConnected !== false)
      .filter((c) => c.dropIds.length === 0 || this.pendingDrops(c, now).length > 0)
      .sort((a, b) => Date.parse(a.endAt ?? 0) - Date.parse(b.endAt ?? 0));
  }

  channelAllowed(campaign, login) {
    return !campaign.allow?.enabled || campaign.allow.channels.includes(login);
  }

  progressSum(gameId) {
    let sum = 0;
    for (const c of this.campaigns.values()) {
      if (c.gameId !== gameId) continue;
      for (const d of this.campaignDrops(c)) sum += d.current ?? 0;
    }
    return sum;
  }
}
