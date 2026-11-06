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
- [Check that it works](#check-that-it-works)
- [Stop, start and update](#stop-start-and-update)
- [Troubleshooting](#troubleshooting)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Uninstall](#uninstall)
- [Development](#development)

## Project status

This is early software and it hasn't been tried with a real Twitch account yet.

| Part | Status |
| --- | --- |
| App starts and reaches the Twitch login step on Windows, macOS and Linux | Passes automated tests |
| Docker image builds, starts Chrome and serves the dashboard and browser view | Passes automated tests, not yet tried on Unraid |
| Finding live Drops streams and playing them muted at 160p | Tested on live Twitch, on macOS only |
| Reading your campaigns and progress, and claiming drops | **Not tested on a real account** |
| Running for days without a restart | **Not tested** |

Start with [Check that it works](#check-that-it-works) before relying on it.

## What you need

| Requirement | Details |
| --- | --- |
| Twitch account | You log in yourself in the browser window the app opens. |
| [Node.js](https://nodejs.org) 20 or newer | Runs the app. The LTS version is fine. Not needed for Docker. |
| Playwright | Controls the browser. It's the only code dependency, and it installs automatically. |
| Chromium | The browser that plays the stream. It downloads automatically, so it won't touch your normal browser or logins. |
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

### 3. Start it

1. Open the extracted `twitch-drops-farmer-main` folder.
2. Double-click `start.bat`.
3. If you see **Windows protected your PC**, click **More info → Run anyway**.

The first start takes a few minutes while it installs dependencies and downloads Chromium. When it's done, the dashboard opens in your web browser and a Chromium window opens on the Twitch login page.

Keep the black terminal window open while it runs, then continue with [First-time setup](#first-time-setup).

### Keep the PC awake

In **Settings → System → Power**, set the sleep timeout to **Never** while you're farming.

## Install on macOS

Works on Apple silicon and Intel Macs.

### 1. Install Node.js

Use the LTS installer from [nodejs.org](https://nodejs.org). If you have Homebrew, you can run this instead:

```bash
brew install node
```

### 2. Download the project

1. Sign in to GitHub in your web browser.
2. Open https://github.com/gvrxx/twitch-drops-farmer.
3. Click **Code → Download ZIP**.
4. Double-click the ZIP in your Downloads folder to unzip it.

### 3. Start it

Open **Terminal** and run:

```bash
cd ~/Downloads/twitch-drops-farmer-main
```

```bash
bash start.command
```

If you put the folder somewhere else, change the first command to match.

Running it this way avoids the macOS block on downloaded scripts. If you'd rather double-click `start.command`, macOS may refuse the first time. To allow it, go to **System Settings → Privacy & Security** and choose **Open Anyway**.

The first start takes a few minutes while it installs dependencies and downloads Chromium. When it's done, the dashboard opens in your web browser and a Chromium window opens on the Twitch login page.

Keep the Terminal window open while it runs, then continue with [First-time setup](#first-time-setup).

### Keep the Mac awake

Start it like this to stop the Mac sleeping while it runs:

```bash
caffeinate -i bash start.command
```

On a laptop, keep it plugged in with the lid open.

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

The `--with-deps` step installs the system libraries Chromium needs and may ask for your password. Open http://127.0.0.1:8411 yourself, then continue with [First-time setup](#first-time-setup).

## Install on Unraid (Docker)

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
4. Continue from step 2 of [First-time setup](#first-time-setup).

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

These steps are the same on every system.

1. **Log in to Twitch.** Use the Chromium window, or the **Browser view** on Docker. If a cookie banner or a 2FA prompt appears, deal with it there yourself. Your login is saved, so you normally do this once per install.
2. **Wait for the games list.** The dashboard loads your active campaigns, which can take about a minute. Click **Refresh now** if the list stays empty.
3. **Pick your games.** Tick the games you want to farm. Use the ↑/↓ arrows to set the order; the top game is farmed first.
4. **Link any game accounts.** If a campaign says **Game account not linked**, click its **Link account** link, connect your account, then click **Refresh now**. Twitch doesn't award drops for unlinked campaigns, so the farmer skips them.

The farmer now starts on its own. Leave the Chromium window open: closing it stops the app. If you minimise it, check that the dashboard still shows **Video playing**.

Only run one copy per Twitch account at a time. A second copy won't earn drops faster.

## Using the dashboard

Open http://127.0.0.1:8411 on the computer running the app, or `http://<unraid-ip>:8411` on Docker.

| Status | Meaning |
| --- | --- |
| **Login needed** | Log in to Twitch in the browser window or browser view. |
| **Refreshing** | Loading your campaigns or inventory. |
| **Searching** | Looking for a live stream that counts. |
| **Farming** | Watching a stream. The channel and drop progress are shown below. |
| **Idle** | Nothing to do right now. It checks again every 5 minutes. |
| **Paused** | You paused it. |

| Control | What it does |
| --- | --- |
| Checkbox and ↑/↓ arrows | Choose which games to farm and in what order. |
| **Refresh now** | Reloads campaigns and inventory immediately. |
| **Pause / Resume** | Stops or restarts watching. The app stays open. |
| **Auto-claim** | Turns automatic claiming on or off. |
| **Browser view** | Docker only. Opens the virtual screen. |

**Activity** at the bottom shows what the app has been doing. Check it first if something looks wrong.

## Check that it works

Do this once before leaving it running:

1. Pick one game with an active campaign, ideally a drop that needs little watch time.
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
- **Update:** download the new ZIP and unzip it to a new folder. Copy `config.json` and `browser-profile` from the old folder into the new one to keep your settings and login, then start it from the new folder.

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
| Install or Chromium download fails | Check your connection, delete the `node_modules` folder if it exists, and run the start script again. |
| Dashboard doesn't open | Go to http://127.0.0.1:8411 yourself. |
| `EADDRINUSE` error | Another copy is running, or another program uses port 8411. Close it, or change the port (see [Settings](#settings)). |
| Error about the profile being in use | A Chromium window from an earlier run is still open. Close it and start again. |
| No games appear | Make sure you're logged in, then click **Refresh now** and wait a minute. If it's still empty, Twitch may have changed its pages. |
| "Drop list loads once this game is selected" stays visible | Tick the game and click **Refresh now**. If it stays, the farmer still watches a drops-enabled stream for that game. |
| **Game account not linked** | Click **Link account**, connect the account, then click **Refresh now**. |
| **Video stalled**, or streams never play | Use a browser you already have, as shown below. |
| Minutes don't go up | Check at https://www.twitch.tv/drops/campaigns that the campaign counts for your account. The app moves to another channel after 25 minutes without progress. |
| Drops finish but aren't claimed | Check **Auto-claim** is on. Otherwise, claim them at https://www.twitch.tv/drops/inventory. |
| `Host ... not allowed` on Docker | Open the dashboard by IP address, or add that hostname to `ALLOWED_HOSTS`. |
| Docker: blank or crashing browser | Make sure the container was started with `--shm-size=1g`. |

**Use your installed browser.** On Windows, run this in PowerShell from the project folder:

```powershell
$env:BROWSER_CHANNEL="msedge"; npm start
```

On macOS with Google Chrome installed, run:

```bash
BROWSER_CHANNEL=chrome npm start
```

The app keeps its own separate profile, so you'll need to log in once more.

## Settings

`config.json` is created in the project folder when you first pick games (in the data folder on Docker). Stop the app before editing it.

| Key | Default | Meaning |
| --- | --- | --- |
| `port` | `8411` | Dashboard port. The `PORT` environment variable overrides it. |
| `autoClaim` | `true` | Claim finished drops automatically. |
| `inventoryRefreshMinutes` | `5` | How often to check progress and claim drops. |
| `campaignRefreshMinutes` | `30` | How often to reload the campaign list. |
| `headless` | `false` | Hide the browser window. Log in once first; this mode hasn't been tested on live Twitch. |

## How it works

- **Campaigns and progress:** the farmer opens your Drops Campaigns and Inventory pages in a background tab and reads the data the site loads there. It never calls Twitch's private API itself. That tab blocks video, so it never counts as a second viewer.
- **Choosing a stream:** for the highest-priority game with something left to earn, it searches the game's directory using the "Drops enabled" filter. If a campaign only counts specific channels, it picks one of those.
- **Watching:** every 30 seconds it checks that the video is moving and the stream is still in the right category. A stuck player is reloaded once, and after that the channel is skipped for 15 minutes. After 25 minutes with no progress, the channel is skipped for an hour.
- **Claiming:** every 5 minutes it reloads your inventory and clicks any **Claim** buttons.

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

`npm test` runs the parser unit tests. `npm run smoke` starts the app with a throwaway profile and checks that it reaches the login step.

CI runs both on macOS, Windows and Linux on every push. It also builds the Docker image and checks that the container reaches the login step.
