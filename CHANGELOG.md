# Changelog

Each version is published on the [Releases page](https://github.com/gvrxx/twitch-drops-farmer/releases), with a Docker image tagged the same. The version the app is running shows next to its name on the dashboard.

## 1.0.0 (2026-11-21)

The first numbered release, covering everything built so far.

> **Can't farm right now:** since Nov 14, 2026 Twitch refuses to send the drop campaigns list to automated browsers. The app shows **Blocked by Twitch** and retries every 30 minutes. See the README.

- Earns drops for the games you pick by playing one eligible stream at a time, muted at 160p, and claims finished drops.
- Local dashboard: game search, farming order, drop progress, Needs linking list, history of claimed drops and watch time, and activity log.
- Farms the campaign that ends soonest first by default, or in your own order.
- Dormant mode: games with nothing to earn are rechecked every 3 days, or soon after an announced event starts.
- Sign-in in a normal browser: `login.command` on macOS, `login.bat` on Windows, and a sign-in window in the browser view on Docker.
- Remembers claimed drops after a restart, reloads the stream every 4 hours, and copes with the computer sleeping.
- Reports when Twitch blocks the campaign list, and keeps the activity log in `activity.log` across restarts.
- Runs on macOS, Windows 11 and Docker (Unraid), with tests on all three in CI.
