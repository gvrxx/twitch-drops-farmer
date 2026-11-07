# Project history

What was built, what we learned, and what's left. For install and usage steps, see the [README](../README.md).

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

CI runs unit tests and a startup test on macOS, Windows and Linux on every push. It also builds the Docker image and checks that it starts.

## Still open

- **Windows with a real account.** It starts and reaches the sign-in step in CI, but `login.bat`, Edge sign-in and real farming haven't been tried.
- **Docker sign-in.** The browser view runs Chrome under automation, so Twitch will refuse a login there. A way to sign in normally in the container is needed. A session copied from a Mac or PC won't work, because cookies are encrypted per machine.
- **Unraid.** The image builds and starts in CI but hasn't run on real Unraid.
- **Running for days.** The 4-hour stream reload is in place, but the app hasn't been left running for days yet, so memory use over that time is unknown.
- **Session expiry.** If the saved login expires, the app waits at **Login needed** until you run the sign-in step again.
- **Keeping up with Twitch.** Site changes can break campaign loading or claiming. Check **Activity** on the dashboard first.

## Picking this up later

1. Read the [README](../README.md) for setup, and run `npm test` to check things still pass.
2. The main logic is in `src/farmer.js` (what to do next), `src/twitch.js` (the browser) and `src/store.js` (Twitch's data).
3. Keep to the one-stream, no-spoofing approach.
4. Suggested order: test Windows, leave it running for a few days, then sort out Docker sign-in and run it on Unraid.
