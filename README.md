# Drops Farmer

Earns Twitch Drops for the games you pick. It plays one eligible stream at a time in a real browser window (muted, 160p), moves to a new channel when a stream ends, raids away or changes game, and claims finished drops for you. You control it from a dashboard in your web browser.

> **Account risk:** automating watch time is against Twitch's Terms of Service. This tool keeps close to normal viewing (one real stream, no spoofed requests), but your account is still at risk. Use it at your own discretion.

## Contents

- [Project status](#project-status)
- [What you need](#what-you-need)
- [Install on Windows 11](#install-on-windows-11)
- [Install on macOS](#install-on-macos)
- [Install on Linux desktop](#install-on-linux-desktop)
- [Install on Unraid (Docker)](#install-on-unraid-docker)
- [First-time setup](#first-time-setup)
- [Using the dashboard](#using-the-dashboard)
- [Dormant mode](#dormant-mode)
- [Check that it works](#check-that-it-works)
- [Stop, start and update](#stop-start-and-update)
- [Troubleshooting](#troubleshooting)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Uninstall](#uninstall)
- [Development](#development)
- [Project history](docs/PROJECT-HISTORY.md)

## Project status

The full cycle works on macOS with a real Twitch account: sign in, find a stream, earn minutes, and claim a drop. Windows and Docker need more testing. See the [project history](docs/PROJECT-HISTORY.md) for details.

| Part | Status |
| --- | --- |
| Signing in with a normal browser, then the app reusing that login | Works on macOS |
| Reading campaigns, drop lists and progress | Works on macOS |
| Finding live Drops streams and playing them muted at 160p | Works on macOS |
| Earning watch time and auto-claiming drops | Works on macOS |
| Dormant mode and adding games with no event | Works on macOS. A full 24-hour wait is covered by automated tests, not waited out live. |
| Windows | Starts and reaches sign-in in automated tests. Not tried with a real account. |
| Docker | Builds and starts in automated tests. **You can't sign in there yet**, and it hasn't run on Unraid. |
| Stream reload for long runs | Works on macOS |
| Minimized browser that doesn't take focus | Works on macOS. The stream keeps playing and earning while minimized. Not tried on Windows. |
| Surviving the computer sleeping | Works on macOS. Nothing is earned while asleep, and it picks up again on wake. |
| Running for days without a restart | **Not tested** |

Your account is still at risk, as noted above. Twitch refuses logins in automated browsers, so it may also reject the saved session in future.

## What you need

| Requirement | Details |
| --- | --- |
| Twitch account | You log in yourself in the browser window the app opens. |
| [Node.js](https://nodejs.org) 20 or newer | Runs the app. The LTS version is fine. Not needed for Docker. |
| Playwright | Controls the browser. It's the only code dependency, and it installs automatically. |
| Browser | Windows uses the installed Microsoft Edge. macOS uses Google Chrome if it's installed. Otherwise a Chromium copy downloads automatically and is used instead. Either way it has its own profile, separate from your normal logins. |
| Disk space | About 500 MB for Chromium and dependencies. |
| Memory | Expect roughly 0.5–1 GB of RAM while it's watching. |
| Internet | Enough for a 160p stream, around 0.5 Mbit/s. |
| Docker (Unraid only) | Enabled under **Settings → Docker** in Unraid. |

The computer must stay awake and online while farming.

This repository is private, so you need to be signed in to the GitHub account that owns it, or one with access, to download it.

## Install on Windows 11

### 1. Install Node.js

Open **Terminal** or **PowerShell** and run:

```powershell
winget install OpenJS.NodeJS.LTS
```

You can also use the LTS installer from [nodejs.org](https://nodejs.org). Close the terminal afterwards so the new install is picked up.

### 2. Download the project

1. Sign in to GitHub in your web browser.
2. Open https://github.com/gvrxx/twitch-drops-farmer.
3. Click **Code → Download ZIP**.
4. Right-click the ZIP, choose **Extract All**, and pick a folder such as `C:\Tools`.

### 3. Sign in to Twitch

Twitch refuses logins in the app's automated browser, so you sign in once in a normal window first.

1. Open the extracted `twitch-drops-farmer-main` folder.
2. Double-click `login.bat`. If you see **Windows protected your PC**, click **More info → Run anyway**.
3. Log in to Twitch in the Microsoft Edge window that opens, including any 2FA or cookie prompts. It has its own profile, so your normal Edge logins aren't touched.
4. Close that Edge window. The black terminal window will say `Done`, and you can close it too.

### 4. Start it

Double-click `start.bat`. The first start takes a few minutes while it installs dependencies and downloads Chromium.

When it's done, the dashboard opens in your default web browser and Edge starts minimized in the taskbar. Keep Edge and the black terminal window open, then continue with [First-time setup](#first-time-setup).

### Keep the PC awake

In **Settings → System → Power**, set the sleep timeout to **Never** while you're farming.

## Install on macOS

Works on Apple silicon and Intel Macs.

### 1. Install Node.js and Chrome

Use the LTS installer from [nodejs.org](https://nodejs.org). If you have Homebrew, you can run this instead:

```bash
brew install node
```

Also install [Google Chrome](https://www.google.com/chrome/) in your Applications folder, because Twitch may refuse logins from the bundled Chromium.

### 2. Download the project

1. Sign in to GitHub in your web browser.
2. Open https://github.com/gvrxx/twitch-drops-farmer.
3. Click **Code → Download ZIP**.
4. Double-click the ZIP in your Downloads folder to unzip it.

### 3. Sign in to Twitch

Twitch refuses logins in the app's automated browser, so you sign in once in a normal window first. Open **Terminal** and run these two commands:

```bash
cd ~/Downloads/twitch-drops-farmer-main
```

```bash
bash login.command
```

If you put the folder somewhere else, change the first command to match.

1. Log in to Twitch in the Chrome window that opens, including any 2FA or cookie prompts. It has its own profile, so you need to log in there even if your normal Chrome is signed in.
2. Click that window and press `Cmd+Q`. Closing the window isn't enough. If your normal Chrome is open too, make sure you quit the sign-in one.
3. Wait for Terminal to say `Done`.

### 4. Start it

In the same Terminal window, run:

```bash
bash start.command
```

Running these scripts with `bash` avoids the macOS block on downloaded scripts. The first start takes a few minutes while it installs dependencies and downloads Chromium.

When it's done, the dashboard opens in your default web browser and Chrome starts minimized in the Dock. Keep Chrome and Terminal open, then continue with [First-time setup](#first-time-setup).

### Keep the Mac awake

Start it like this to stop the Mac sleeping while it runs:

```bash
caffeinate -i bash start.command
```

On a laptop, keep it plugged in with the lid open. While the Mac sleeps, nothing is earned. The app picks up again by itself when it wakes, and the dashboard shows "Couldn't reach Twitch" warnings for that time.

## Install on Linux desktop

Install Node.js 20 or newer, then download or copy the project and run these from its folder:

```bash
npm install
```

```bash
npx playwright install --with-deps chromium
```

```bash
npm start
```

The `--with-deps` step installs the system libraries Chromium needs and may ask for your password.

Sign in with Google Chrome or Chromium installed on your system. Stop the app, run `npm run login`, log in, close the browser, then run `npm start` again. Open http://127.0.0.1:8411 yourself and continue with [First-time setup](#first-time-setup).

## Install on Unraid (Docker)

> **Not usable yet:** Twitch refuses logins in automated browsers, and the browser view is one. Until there's a way to sign in normally inside the container, you can't log in here. Everything below is ready for when that's solved.

The container runs Chrome on a virtual screen, so Unraid doesn't need a monitor. It uses two ports:

- **8411:** the dashboard.
- **6080:** the *browser view*, which shows that virtual screen in your web browser. You use it to log in to Twitch.

### 1. Copy the project to the server

1. Download the ZIP as in the Windows or macOS steps, and unzip it.
2. Copy the folder to `/mnt/user/appdata/twitch-drops-farmer-src` on the server, using a network share or `scp`.

### 2. Build the image

Open the Unraid terminal (the `>_` icon at the top right) and run:

```bash
docker build -t twitch-drops-farmer /mnt/user/appdata/twitch-drops-farmer-src
```

### 3. Start the container

Change `TZ` to your timezone and `change-me` to a password of your own, then run:

```bash
docker run -d --name twitch-drops-farmer --restart unless-stopped --init --shm-size=1g -p 8411:8411 -p 6080:6080 -e TZ=Europe/London -e VNC_PASSWORD=change-me -e ALLOWED_HOSTS=tower,tower.local -v /mnt/user/appdata/twitch-drops-farmer:/data twitch-drops-farmer
```

The container appears in Unraid's **Docker** tab and restarts on its own after a reboot or crash. Settings and your Twitch login are stored in `/mnt/user/appdata/twitch-drops-farmer`.

`--shm-size=1g` is required because Chrome crashes with Docker's small default shared memory.

### 4. Log in

1. Open `http://<unraid-ip>:8411`.
2. Click **Browser view** and enter your password. Only its first 8 characters count.
3. Log in to Twitch in the Chrome window you see there.
4. Continue with [First-time setup](#first-time-setup).

### Using Docker Compose instead

If you have the *Docker Compose Manager* plugin, or `docker compose` on another Docker host, copy `.env.example` to `.env`, fill it in, and run this from the project folder:

```bash
docker compose up -d --build
```

### Docker security

- The browser view has access to your logged-in Twitch session, so always set a password.
- The dashboard has no password, so anyone on your network can open it.
- Don't forward ports 8411 or 6080 to the internet.
- Once you're logged in, you can recreate the container with `-e ENABLE_BROWSER_VIEW=false` to switch off port 6080.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VNC_PASSWORD` | none | Browser view password. Only the first 8 characters count. |
| `ALLOWED_HOSTS` | none with `docker run`, `tower,tower.local` with Compose | Hostnames you use to reach the dashboard. IP addresses always work. |
| `ENABLE_BROWSER_VIEW` | `true` | Set to `false` to switch off port 6080. |
| `TZ` | `Etc/UTC` in Compose | Timezone for log timestamps. |
| `DATA_PATH` | `/mnt/user/appdata/twitch-drops-farmer` | Compose only. Where settings and the browser profile are kept. |

## First-time setup

These steps are the same on every system, once you've signed in and started the app as described in your install guide.

1. **Wait for the games list.** The dashboard loads your active campaigns, which can take about a minute. Click **Refresh now** if the list stays empty.
2. **Pick your games.** Tick the games you want to farm. By default the app farms the campaign that ends soonest first, so nothing runs out while another game is being watched. To set the order yourself, change **Farm first** to **My order (↑↓)** and use the arrows. To add a game that isn't listed, such as one with no event right now, search for it in the box above the list and pick it from the suggestions.
3. **Link any game accounts.** Most campaigns need this. The **Needs linking** section lists every campaign waiting for a link, with your selected games first and in red. Click **Link account**, connect your account, then click **Refresh now**. Twitch doesn't award drops for unlinked campaigns, so the farmer skips them.

The farmer now starts on its own. Leave the app's browser running in the Dock or taskbar, because quitting it stops the app.

Only run one copy per Twitch account at a time. A second copy won't earn drops faster.

## Using the dashboard

Open http://127.0.0.1:8411 on the computer running the app, or `http://<unraid-ip>:8411` on Docker.

### What runs where

| Part | Where you see it | Can you close it? |
| --- | --- | --- |
| **Dashboard** | Your default browser, such as Waterfox or Safari | Yes. Farming continues; reopen the address any time. |
| **Stream** | Chrome on macOS, Edge on Windows, minimized | No. Quitting it stops the app. |
| **App** | The Terminal or black command window | No. Closing it stops everything. |

The app's browser uses its own profile, so your normal browsers, bookmarks and logins aren't touched. A dashboard tab opens each time you start the app, so close the old one if you restart. Chrome briefly appears at startup, then stays minimized and doesn't take focus. You can open it from the Dock or taskbar to see the stream.

| Status | Meaning |
| --- | --- |
| **Login needed** | Log in to Twitch in the browser window or browser view. |
| **Refreshing** | Loading your campaigns or inventory. |
| **Searching** | Looking for a live stream that counts. |
| **Farming** | Watching a stream. The channel and drop progress are shown below. |
| **Idle** | A selected game has drops, but no eligible stream is live. It checks again every 5 minutes. |
| **Dormant** | None of your selected games have drops to earn. See [Dormant mode](#dormant-mode). |
| **Blocked by Twitch** | Twitch refused to send your drop campaigns to the app's browser ("failed integrity check"). Nothing can be farmed. The app tries again every 30 minutes. See [Troubleshooting](#troubleshooting). |
| **Paused** | You paused it. |

| Control | What it does |
| --- | --- |
| Checkbox | Choose which games to farm. The number before a selected game is its place in the farming order. |
| **Farm first** | **The campaign ending soonest** (default) farms the game whose campaign ends first, and the ↑/↓ arrows only break ties. **My order (↑↓)** farms the games in the order you set with the arrows. |
| **Search box** | Finds any Twitch game as you type, including games with no event, and adds the one you pick. Results show whether a game has drops right now. |
| **Hide drops / Show drops** | Folds a game's drop list, or the one under the stream you're watching, into a one-line summary. Your choice is remembered in that browser. |
| **Refresh now** | Reloads campaigns and inventory immediately. |
| **Pause / Resume** | Stops or restarts watching. The app stays open. |
| **Auto-claim** | Turns automatic claiming on or off. |
| **Browser view** | Docker only. Opens the virtual screen. |

**Needs linking** lists every active campaign that's skipped because your game account isn't linked. Selected games come first, in red; the button underneath shows the rest. Each row has a **Link account** button. Click **Refresh now** after linking.

**History** shows the drops claimed while the app was running, newest first, and how long each game was watched. Only time when the video was actually playing counts. It's saved in `history.json` in the project folder (the data folder on Docker), so it survives restarts. Drops claimed before the app first started aren't listed. Delete the file to start over.

**Activity** at the bottom shows what the app has been doing. Check it first if something looks wrong. It's also written to `activity.log` in the project folder (the data folder on Docker), so the last 200 lines are still there after a restart, and you can open the file to see what happened while you were away. Past 1 MB it's moved to `activity.old.log` and a new file starts.

## Dormant mode

You can leave a game selected even when it has no event. A selected game goes dormant when there's nothing to earn, and the dashboard shows the reason and the next check time:

| Reason | What to do |
| --- | --- |
| **No active event** | Nothing. It wakes when an event starts. |
| **All drops earned** | Nothing. It wakes when a new event starts. |
| **Game account not linked** | Click **Link account**, then **Refresh now**. |

- **Other games keep going.** If another selected game has drops, the app keeps farming that one. Dormant games are skipped, and the app notices a new event for them at its regular 30-minute campaign check.
- **When every selected game is dormant,** the app stops watching and leaves Twitch's pages. It rechecks every 3 days.
- **Announced events are caught early.** If Twitch lists an upcoming event for a game, the app checks 5 minutes after it starts instead of waiting out the 3 days.
- **Check right away** with **Refresh now**.

The app and its browser window must stay open for rechecks to happen. Dormant state isn't saved, so restarting the app checks again immediately.

## Check that it works

Do this once before leaving it running:

1. Pick one game with an active campaign that isn't marked **Game account not linked**, ideally with a drop that needs little watch time.
2. Check that the game shows **1 active campaign** or more, and that its drops are listed.
3. Wait until the status shows **Farming** and **Video playing**.
4. Leave it for 15 minutes.
5. Check that the drop's minutes have gone up. The dashboard updates them about every 5 minutes.
6. When a drop finishes, check that **Activity** says it was claimed, then confirm it at https://www.twitch.tv/drops/inventory.

If any of these fail, keep the contents of **Activity**, as that's what's needed to fix it.

## Stop, start and update

### Windows and macOS

- **Stop:** click the terminal window and press `Ctrl+C`. On Windows, answer `Y` if it asks to terminate the batch job.
- **Start again:** run `start.bat` or `bash start.command` the same way as before.
- **Update:** download the new ZIP and unzip it to a new folder. Copy `config.json`, `history.json` and `browser-profile` from the old folder into the new one to keep your settings and login, then start it from the new folder.

### Docker

Stop or start it from Unraid's **Docker** tab. To update, copy the new files over the source folder, then run:

```bash
docker rm -f twitch-drops-farmer
```

```bash
docker build -t twitch-drops-farmer /mnt/user/appdata/twitch-drops-farmer-src
```

Then run the `docker run` command from [step 3](#3-start-the-container) again. Your settings and login stay in `/mnt/user/appdata/twitch-drops-farmer`.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| "Node.js 20 or newer is required" | Install Node.js, close the terminal, and try again. On Windows, sign out and back in if it still isn't found. |
| Twitch says your browser isn't supported at login | Twitch refuses logins in automated browsers. Stop the app, run `login.bat` or `bash login.command`, sign in there, then start the app again. |
| App says **Blocked by Twitch**, or loads 0 campaigns | Twitch is refusing to send the drop campaigns list to the app's browser. Its anti-bot check ("failed integrity check") flags automated browsers. Open https://www.twitch.tv/drops/campaigns in your normal browser. If campaigns show there, the block is aimed at automated browsers and the app can't farm until Twitch lifts it. If they're missing there too, it's a Twitch problem that should clear on its own. The app doesn't try to get around this check. |
| App says **Login needed** | The saved login is missing or expired. Stop the app and run the sign-in step again. If that doesn't help, delete `browser-profile` and repeat it. |
| Install or Chromium download fails | Check your connection, delete the `node_modules` folder if it exists, and run the start script again. |
| Dashboard doesn't open | Go to http://127.0.0.1:8411 yourself. |
| "Drops Farmer is already running" | A copy is already running, so use its dashboard. To restart, stop that copy with `Ctrl+C` in its window first. If no copy is running, another program is using port 8411; change the port (see [Settings](#settings)). |
| Error about the profile being in use | A browser window from an earlier run is still open. Close it and start again. |
| No games appear | Make sure you're signed in, then click **Refresh now** and wait a minute. If it's still empty, Twitch may have changed its pages. |
| Almost everything says **Game account not linked** | This is normal. Link only the games you play. |
| "Couldn't find" a game in **Activity** | You pressed Enter without picking a suggestion, and the name didn't match. Type part of the name and pick it from the list instead. |
| The search shows nothing for a game you know exists | Check the spelling. Results use Twitch's own search, so try the name as it appears on Twitch. |
| A game stays **Dormant** though an event has started | Click **Refresh now**. If it's still dormant, check the reason shown next to the game. |
| "Drop list loads once this game is selected" stays visible | Tick the game and click **Refresh now**. If it stays, the farmer still watches a drops-enabled stream for that game. |
| **Game account not linked** | Click **Link account**, connect the account, then click **Refresh now**. |
| **Video stalled**, or streams never play | Use a browser you already have, as shown below. |
| Minutes don't go up | Check at https://www.twitch.tv/drops/campaigns that the campaign counts for your account. The app moves to another channel after 25 minutes without progress. |
| Drops finish but aren't claimed | Check **Auto-claim** is on. Otherwise, claim them at https://www.twitch.tv/drops/inventory. |
| Chrome or Edge keeps coming to the front | Check `minimizeBrowser` isn't `false`, and that you started the latest version. |
| "Couldn't reach Twitch" warnings | The computer was asleep or the connection dropped. The app retries every 30 seconds and resumes by itself. |
| `Host ... not allowed` on Docker | Open the dashboard by IP address, or add that hostname to `ALLOWED_HOSTS`. |
| Docker: blank or crashing browser | Make sure the container was started with `--shm-size=1g`. |

**Choose a browser.** Windows uses Edge by default, and macOS uses Chrome if it's installed. To use Google Chrome on Windows, run this in PowerShell from the project folder:

```powershell
$env:BROWSER_CHANNEL="chrome"; npm start
```

To force the bundled Chromium on macOS, run:

```bash
BROWSER_CHANNEL=chromium npm start
```

These commands don't open the dashboard, so go to http://127.0.0.1:8411 yourself. If you switch browsers, close the app first and delete `browser-profile`. You'll then need to log in again.

## Settings

`config.json` is created in the project folder when you first pick games (in the data folder on Docker). Stop the app before editing it.

| Key | Default | Meaning |
| --- | --- | --- |
| `port` | `8411` | Dashboard port. The `PORT` environment variable overrides it. |
| `autoClaim` | `true` | Claim finished drops automatically. |
| `inventoryRefreshMinutes` | `5` | How often to check progress and claim drops. |
| `campaignRefreshMinutes` | `30` | How often to reload the campaign list. |
| `playerReloadHours` | `4` | How often to reload the stream to free up memory. `0` turns it off. |
| `farmOrder` | `"ending"` | `"ending"` farms the campaign that ends soonest first; `"priority"` follows your game order. Also set from the dashboard's **Farm first** menu. |
| `minimizeBrowser` | `true` | Start the app's browser minimized. Set to `false` to keep it on screen. Docker always keeps it on screen. |
| `headless` | `false` | Hide the browser window. Log in once first; this mode hasn't been tested on live Twitch. |

## How it works

- **Signing in:** you log in yourself in a normal browser window, with no automation attached. The app doesn't try to hide that it's automated; it reuses the login saved in its profile.
- **Campaigns and progress:** the farmer opens your Drops Campaigns and Inventory pages in a background tab and reads the data the site loads there. It never calls Twitch's private API itself. That tab blocks video, so it never counts as a second viewer.
- **Choosing a game:** among your selected games with something left to earn, it picks the one whose campaign ends soonest, or the top one in **My order** mode. Drops that can no longer be finished before they expire are ignored.
- **Choosing a stream:** for that game, it searches the game's directory using the "Drops enabled" filter. If a campaign only counts specific channels, it picks one of those.
- **Watching:** every 30 seconds it checks that the video is moving and the stream is still in the right category. A stuck player is reloaded once, and after that the channel is skipped for 15 minutes. After 25 minutes with no progress, the channel is skipped for an hour.
- **Staying out of the way:** the app's browser starts minimized and never pulls itself to the front. Flags in `src/twitch.js` stop Chrome from pausing a minimized stream.
- **Sleep:** time the computer spends asleep doesn't count against a channel, so a channel isn't wrongly skipped for "no progress" after a night's sleep.
- **Long runs:** every 4 hours it reloads the stream, because Twitch's player can use more memory the longer it runs. Drop progress isn't lost.
- **Claiming:** every 5 minutes it reloads your inventory and clicks any **Claim** buttons. It also reads your claimed rewards, so drops already earned aren't farmed again after a restart.
- **Dormant games:** selected games with nothing to earn are set aside and rechecked. See [Dormant mode](#dormant-mode).

Your Twitch login stays in `browser-profile/` on your machine. Treat that folder like a password, and don't share it. It's excluded from Git.

Twitch changes its site often, and the farmer relies on the structure of its pages, so a Twitch update can break campaign loading or claiming.

## Uninstall

1. Stop the app.
2. Delete the project folder. This also removes your saved login and settings.
3. Optional: delete the downloaded Chromium, which may be shared with other Playwright tools:
   - **Windows:** `%LOCALAPPDATA%\ms-playwright`
   - **macOS:** `~/Library/Caches/ms-playwright`
   - **Linux:** `~/.cache/ms-playwright`

On Docker, run the command below, then delete `/mnt/user/appdata/twitch-drops-farmer` and `/mnt/user/appdata/twitch-drops-farmer-src`:

```bash
docker rm -f twitch-drops-farmer && docker rmi twitch-drops-farmer
```

## Development

```bash
npm install
```

```bash
npm test
```

```bash
npm run smoke
```

`npm test` runs the unit tests for the parser and dormant mode. `npm run smoke` starts the app with a throwaway profile and checks that it reaches the login step.

CI runs both on macOS, Windows and Linux on every push. It also builds the Docker image and checks that the container reaches the login step.
