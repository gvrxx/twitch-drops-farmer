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
6. **Dormant mode.** Selected games with nothing to earn go quiet and get rechecked every 24 hours.

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

## Test results

Tested on macOS with a real Twitch account:

| Step | Result |
| --- | --- |
| Sign in with normal Chrome, app reuses the session | Worked |
| Load campaigns and drop lists | Worked: 119 active campaigns at the time |
| Find a live stream and play it | Worked, muted at 160p |
| Earn watch time | Worked: 15 minutes gave 15 minutes on every drop |
| Auto-claim | Worked: the first drop was claimed automatically once it reached 30 minutes |

Only 2 of those 119 campaigns were ready to farm. The rest needed a game account linked first, so linking matters a lot.

CI runs unit tests and a startup test on macOS, Windows and Linux on every push. It also builds the Docker image and checks that it starts.

## Still open

- **Windows with a real account.** It starts and reaches the sign-in step in CI, but `login.bat`, Edge sign-in and real farming haven't been tried.
- **Docker sign-in.** The browser view runs Chrome under automation, so Twitch will refuse a login there. A way to sign in normally in the container is needed. A session copied from a Mac or PC won't work, because cookies are encrypted per machine.
- **Unraid.** The image builds and starts in CI but hasn't run on real Unraid.
- **Running for days.** Twitch's player may use more memory over time. A reload of the stream every few hours is the likely fix.
- **Session expiry.** If the saved login expires, the app waits at **Login needed** until you run the sign-in step again.
- **Keeping up with Twitch.** Site changes can break campaign loading or claiming. Check **Activity** on the dashboard first.

## Picking this up later

1. Read the [README](../README.md) for setup, and run `npm test` to check things still pass.
2. The main logic is in `src/farmer.js` (what to do next), `src/twitch.js` (the browser) and `src/store.js` (Twitch's data).
3. Keep to the one-stream, no-spoofing approach.
4. Suggested order: test Windows, sort out Docker sign-in, then add the periodic stream reload and run it on Unraid.
