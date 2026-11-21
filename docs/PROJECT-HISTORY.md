# Project history

What was built, what we learned, and what's left. For install and usage steps, see the [README](../README.md).

## Paused

**Since Nov 14, 2026 the project is paused.** Twitch answers the app's request for the drop campaigns list with "failed integrity check" (`currentUser.dropCampaigns`). The same page works in a normal browser on the same account, so Twitch is turning away automated browsers on purpose. The inventory still loaded.

That's the situation this project planned for from the start: the app doesn't hide its automation, and when Twitch refuses it, we don't work around the refusal. That rules out stealth browsers, borrowed integrity tokens, and reading the same data from other pages to get past the block. The app now reports **Blocked by Twitch** and retries every 30 minutes.

**Update, Nov 21, 2026:** the inventory still lists campaigns you've already started, with their drops and progress, and the app farms those. On Unraid it farmed Where Winds Meet and claimed drops. Campaigns you haven't started can't be found, so selected games with nothing visible show "Can't see its campaigns" and are rechecked every 30 minutes.

To check later whether Twitch has changed this, start the app and look at the status. **Blocked by Twitch** means it's still blocked. If campaigns load, everything else still works as described below. If the block stays, the project needs a different approach that Twitch allows, not a workaround.

## What this project is

Drops Farmer earns Twitch Drops for selected games. It plays one eligible stream at a time in a real browser, tracks progress, claims finished drops, and is controlled from a local dashboard.

Early on we chose a real browser over a lighter tool that fakes watch events through Twitch's private API. It uses more memory, but it needs no fake clients or spoofed requests and is closer to normal viewing.

## How it was built

1. **Core app.** Node.js with Playwright as the only dependency. A background tab reads the data Twitch's own pages load, and a second tab plays the stream.
2. **Dashboard.** A local web page for picking games, setting priority and following progress.
3. **Docker.** An image with Chrome on a virtual screen and a noVNC browser view, plus LAN access settings. This was meant for Unraid.
4. **macOS and Windows.** Double-click launchers, tests, and CI on macOS, Windows, Linux and Docker.
5. **Sign-in step.** Added after Twitch refused logins in the automated browser.
6. **Dormant mode.** Selected games with nothing to earn go quiet and get rechecked every 3 days (originally every 24 hours).
7. **Stream reload.** The stream reloads every 4 hours to keep the player's memory down.
8. **Staying out of the way.** The browser starts minimized and no longer pulls itself to the front when it opens a stream.
9. **Sleep handling.** Time asleep no longer counts against a channel, and network errors from sleeping show as short warnings.
10. **Game search.** The dashboard's search box suggests games as you type, including ones with no event, using Twitch's own category search.
11. **Collapsible drop lists.** Each game's drops, and the ones under the current stream, can be folded into a one-line summary.
12. **Ending-soonest order.** By default the game whose campaign ends first is farmed first, so drops don't expire while another game is watched. Your own order is still available.
13. **Needs linking.** One list of every campaign skipped for an unlinked game account, with its link.
14. **History.** Claimed drops and watch time per game are saved to `history.json` and shown on the dashboard.
15. **Blocked-by-Twitch status and saved activity.** The app reports when Twitch refuses the campaign list, and the activity log is kept in `activity.log` across restarts.
16. **Docker sign-in.** When you're not logged in, the app closes its automated browser and opens a normal Chrome in the browser view, the same way `login.command` works on a Mac. It starts its own browser again once you close that window.
17. **Versions and releases.** The app has a version number, shown on the dashboard. Pushing a `v<version>` tag runs the Release workflow: it checks the tag matches `package.json`, runs the tests, publishes a Docker image to `ghcr.io/gvrxx/twitch-drops-farmer` and creates a GitHub release from `CHANGELOG.md`.
18. **Unraid from the published image.** Unraid downloads the image instead of building it. The image carries Unraid's WebUI label, so the container's menu opens the dashboard.
19. **One-click updates for all apps.** `docker/unraid-update-all.sh` runs from Unraid's User Scripts plugin, daily or with **Run Script**. It updates each app listed in it, and restarts only those with a new version.
20. **App icon.** A white drop on purple, served by the dashboard at `/icon.png`. It's the browser tab icon, and the update script points Unraid's icon label at it.
21. **Public repository (Nov 21, 2026).** The repository and its Docker image are public, so installing and updating need no GitHub account or token. Before that, the history was checked for personal details and rewritten so commits and tags use GitHub's private noreply email. The example timezone in the docs and update script became `Europe/London`. Versions 1.0.0 to 1.0.4 were deleted (releases, tags and Docker images), so 1.0.5 is the first public release and the changelog has a single entry for it.

## What we learned

### Twitch refuses logins in automated browsers

Logging in through the app showed a "browser not supported" message. We first suspected Playwright's Chromium, but Google Chrome under automation was refused in the same way. The login page loads normally and the refusal comes when you log in, so the cause is automation rather than the browser.

**Decision:** the app doesn't try to hide its automation from Twitch. No stealth patches, no spoofed browser details. Instead, the person signs in themselves in a normal browser window with nothing attached (`login.command` or `login.bat`), and the app reuses that saved session. The session has worked so far.

Twitch has shown it doesn't want automated browsers, so it could reject these sessions in future. If that happens, don't work around it; the approach needs rethinking.

### The saved login needs the real keychain

Playwright starts browsers with a mock keychain on macOS. Cookies saved by a normal Chrome sign-in can't be read under it, and they silently disappear. The app now drops that setting with `ignoreDefaultArgs: ['--use-mock-keychain']`. We confirmed the difference with a test cookie before changing it.

### Use an installed browser

Windows uses Edge and macOS uses Chrome when it's installed. Playwright's bundled browser shows as "Google Chrome for Testing", which is how to tell which one is running.

### Reading Twitch's data

Twitch's responses are matched by object type (`__typename`) rather than by query name, so renamed queries keep working. The campaigns list gives placeholder drops with no watch time, and full details only load when a game's section is expanded. Placeholder drops count as "details missing", not as "nothing to earn".

Once every drop in a campaign is claimed, Twitch removes the campaign from the inventory's in-progress list. After a restart the app used to think those drops were unearned and farmed the game again. It now also reads the inventory's list of claimed rewards and matches each drop's reward IDs against it. A drop counts as claimed only if its rewards were awarded after the drop started, so a reward from an earlier campaign doesn't count.

The game link under a stream can also be a "Streaming Together" link on collab streams, so the health check only accepts links to `/directory/`.

### A minimized browser still earns

Chrome can pause or throttle a minimized page. The app launches it with `--disable-backgrounding-occluded-windows` and `--disable-background-media-suspend`, so the page still counts as visible. In a 25-minute test with Chrome minimized, the video never stalled, the page never counted as hidden, and drop progress kept rising.

The app used to call `bringToFront()` whenever it opened a stream, which pulled Chrome in front of whatever you were doing. That's gone. The player tab is now opened last, so it's the active tab without needing focus.

### What sleep looks like

The first overnight run on a sleeping MacBook showed this:

- Nothing is earned while the Mac sleeps. Progress rose only 22 minutes overnight.
- Each brief maintenance wake caused a `net::ERR_NETWORK_CHANGED` error. The app retried, and it resumed by itself when the Mac woke properly.
- The no-progress check counted sleep as watch time and skipped a channel after "76 minutes". Time asleep is now excluded.

To farm overnight, keep the computer awake (`caffeinate -i` on macOS).

### Searching for games

Twitch's search page (`/search?term=...&type=categories`) returns categories in a `SearchForResultGames` section, separate from channel results. The app reads only that section, in a third browser tab of its own so searches never wait on farming. A search takes about a second.

Twitch finds nothing while the last word is half-typed ("hollow kn"), even though "hollow" works. The app then searches again without the unfinished word and keeps the names that contain what you typed. Twitch's own results can include loosely related categories, such as "Just Chatting" for "rust", and those are shown as Twitch returns them.

### Running on Unraid

The repository started out private, and so did its image. Downloading a private image needs a classic GitHub token with only **read:packages**; fine-grained tokens can't log in to ghcr.io. Unraid keeps `docker login` in memory, so it's lost on reboot, which is why the update script can keep a token in `/boot/config/drops-farmer-github-token` on the flash drive and log in each time it runs. Since the repository and image went public, Drops Farmer needs no token, and the script only logs in when that file exists.

Each app in the update script is one `app` entry: container name, image, then its `docker run` options. The script compares the running container's image with the newly downloaded one, and only recreates the container when they differ. Settings live in the app's data folder, so recreating it loses nothing.

Unraid's container icon comes from the `net.unraid.docker.icon` label, which must be a web address Unraid can load. GitHub's addresses for a private repository need a login (the repository was private at the time), so the dashboard serves the icon itself, and the update script fills in the server's own address when it starts the container. Unraid only re-reads a container's icon when you click **Check for Updates** in the Docker tab; until then it keeps showing a question mark, even though the label and address are correct.

### Going public

The repository and its Docker image have separate visibility settings. Making the repository public leaves the image private, and the image's visibility can only be changed on its package settings page on GitHub, not through GitHub's API.

Commit and tag authors are public along with the code, so they use GitHub's noreply address (`<id>+gvrxx@users.noreply.github.com`). Keep `git config user.email` set to it. The history was rewritten to replace the earlier address, which changed every commit hash. While force-pushing the rewritten tags, the Release workflow was turned off so it wouldn't publish old versions again as `latest`.

The old versions were then deleted. Releases and their tags go with `gh release delete v<version> --cleanup-tag`. Docker image versions are deleted on the package's **versions** page on GitHub. Each release there is three entries: the tagged image plus two untagged parts (the image itself and its build attestation). Check which untagged parts belong to the version you keep before deleting any; deleting one of those would break that version's download.

Two more places kept the old email after the rewrite. CI runs on GitHub Actions store the commit author of the commit they ran on, so the runs from before the rewrite were deleted. The image's build attestation contained the whole GitHub push event, including the pusher's email, so the Release workflow now builds without attestations (`provenance: false`, `sbom: false`), and 1.0.5 was published again from the same code.

## Test results

Tested on macOS with a real Twitch account:

| Step | Result |
| --- | --- |
| Sign in with normal Chrome, app reuses the session | Worked |
| Load campaigns and drop lists | Worked: 119 active campaigns at the time |
| Find a live stream and play it | Worked, muted at 160p |
| Earn watch time | Worked: 15 minutes gave 15 minutes on every drop |
| Auto-claim | Worked: the first drop was claimed automatically once it reached 30 minutes |
| Minimized browser | Worked: 25 minutes minimized with no stalls and rising progress |
| Overnight on a sleeping Mac | Survived and resumed by itself; earned only while awake |
| Stream reload | Worked: with a 3-minute test interval, video came back after both reloads on the same channel and drop progress kept rising |

Only 2 of those 119 campaigns were ready to farm. The rest needed a game account linked first, so linking matters a lot.

On Unraid, Nov 21, 2026: the published image installed, sign-in through the browser view worked, it farmed Where Winds Meet from the inventory and claimed drops, and the update script moved it from 1.0.0 to 1.0.4 and then reported "up to date".

CI runs unit tests and a startup test on macOS, Windows and Linux on every push. It also builds the Docker image, checks that it starts, and checks that the sign-in window opens and reopens.

## Still open

- **Twitch blocks the campaign list (Nov 14, 2026).** The project is paused because of this; see [Paused](#paused). A normal browser still shows the campaigns, so the block is aimed at automated browsers.

- **Windows with a real account.** It starts and reaches the sign-in step in CI, but `login.bat`, Edge sign-in and real farming haven't been tried.
- **Running for days.** The 4-hour stream reload is in place, but the app hasn't been left running for days yet, so memory use over that time is unknown.
- **Session expiry.** If the saved login expires, the app waits at **Login needed** until you run the sign-in step again. On Docker it opens the sign-in window in the browser view by itself.
- **Token expiry.** Only matters if the update script also pulls private images. If that token expires, the script says so; create a new one and save it to the same file on the flash drive.
- **Keeping up with Twitch.** Site changes can break campaign loading or claiming. Check **Activity** on the dashboard first.

## Picking this up later

1. Read the [README](../README.md) for setup, and run `npm test` to check things still pass.
2. The main logic is in `src/farmer.js` (what to do next), `src/twitch.js` (the browser) and `src/store.js` (Twitch's data).
3. Keep to the one-stream, no-spoofing approach.
4. Suggested order: test Windows with a real account, then leave Unraid running for a few days and check memory use.
5. To release a change, follow "To publish a new version" in the README's Development section. Unraid picks it up at the next daily update.
