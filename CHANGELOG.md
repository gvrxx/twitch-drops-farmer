# Changelog

Each version is published on the [Releases page](https://github.com/gvrxx/twitch-drops-farmer/releases), with a Docker image tagged the same. The version the app is running shows next to its name on the dashboard.

## 1.0.5 (2026-11-21)

The first public release.

> **Partly blocked:** since Nov 14, 2026 Twitch refuses to send the full drop campaigns list to automated browsers. Campaigns you've already started (they show in your Twitch inventory) are still farmed. See the README.

- Earns drops for the games you pick by playing one eligible stream at a time, muted at 160p, and claims finished drops.
- Local dashboard: game search, farming order, drop progress, Needs linking list, history of claimed drops and watch time, and activity log. A divider labelled "Other games with drops" separates your selected games from the rest.
- Farms the campaign that ends soonest first by default, or in your own order.
- Dormant mode: games with nothing to earn are rechecked every 3 days, or soon after an announced event starts. While Twitch blocks the campaign list, selected games with nothing visible show "Can't see its campaigns" and are rechecked every 30 minutes.
- When Twitch refuses the campaign list, the dashboard shows **Blocked by Twitch**, or a yellow note if campaigns from your inventory are still being farmed. The activity log is kept in `activity.log` across restarts.
- Sign-in in a normal browser: `login.command` on macOS, `login.bat` on Windows, and a sign-in window in the browser view on Docker.
- Remembers claimed drops after a restart, reloads the stream every 4 hours, and copes with the computer sleeping.
- Runs on macOS, Windows 11 and Docker, with tests on all three in CI.
- Unraid: a published image at `ghcr.io/gvrxx/twitch-drops-farmer`, **WebUI** in the container's menu, an app icon in the Docker tab, and one-click updates with the User Scripts plugin (see the README).
