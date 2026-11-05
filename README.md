# Drops Farmer

Earns Twitch Drops for the games you pick. It plays one eligible stream at a time in a real Chromium window (muted, 160p), finds a new channel when a stream ends, raids away or changes game, and claims finished drops for you. You control it from a local dashboard.

> Automating watch time is against Twitch's Terms of Service. This tool keeps to normal viewing (one real stream, no spoofed requests), but your account is still at risk. Use it at your own discretion.

## Setup (macOS and Windows)

1. Install [Node.js](https://nodejs.org) 20 or newer (the LTS version is fine).
2. Download this repository: use **Code → Download ZIP** and unzip it, or clone it with git.
3. Start it:
   - **Windows:** double-click `start.bat`.
   - **macOS:** double-click `start.command`. If macOS blocks it, right-click it, choose **Open**, then confirm.

The first start installs dependencies and downloads Chromium, which takes a minute or two. Later starts are quick. The dashboard opens at **http://127.0.0.1:8411**. Keep the terminal window open while it runs.

From a terminal, the equivalent is:

```bash
npm install
npm run install-browser
npm start
```

If streams won't play in the bundled Chromium, set `BROWSER_CHANNEL` to use a browser you already have: `msedge` on Windows or `chrome` if Google Chrome is installed. For example, in PowerShell: `$env:BROWSER_CHANNEL="msedge"; npm start`.

## First run

1. A Chromium window opens on the Twitch login page. Log in there yourself. The login is saved in `browser-profile/`, so you only do this once.
2. Once you're logged in, the dashboard lists every game that has an active drop campaign. Tick the games you want and use the ↑/↓ arrows to set priority. The top game is farmed first.
3. If a campaign says **Game account not linked**, use its **Link account** link first. Twitch doesn't award drops for unlinked campaigns, so the farmer skips them.

Leave the Chromium window open. You can move it aside or minimise it, but closing it stops the farmer.

## Running 24/7 on Unraid (Docker)

The container runs a real Chrome on a virtual screen. You reach it on two ports:

- **8411:** the dashboard.
- **6080:** a *browser view* of that screen in your web browser. You use it once to log in to Twitch, and later to check what it's watching.

### 1. Copy the project to the server

Copy this folder to the Unraid server, for example to `/mnt/user/appdata/twitch-drops-farmer-src`. You don't need `node_modules` or `browser-profile`.

### 2. Configure

In that folder, copy `.env.example` to `.env` and set at least `VNC_PASSWORD`. That password protects the browser view, which holds your logged-in Twitch session.

### 3. Build and start

You can do this either way:

- **Compose Manager plugin (recommended):** install *Docker Compose Manager* from Community Applications. Add a stack whose folder points to the copied project, then click **Compose Up**.
- **Unraid terminal:**
  ```bash
  cd /mnt/user/appdata/twitch-drops-farmer-src && docker compose up -d --build
  ```

Either way, the container appears in Unraid's Docker tab and restarts on its own after reboots or crashes. Settings and your login are saved in `/mnt/user/appdata/twitch-drops-farmer`.

### 4. Log in once

Open `http://<unraid-ip>:8411` and click **Browser view**. Enter the VNC password, then log in to Twitch in the Chrome window you see. After that, pick your games on the dashboard as usual.

To update after changing the code, run the same `docker compose up -d --build` again.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VNC_PASSWORD` | (required) | Browser view password. Only the first 8 characters count. |
| `ALLOWED_HOSTS` | `tower,tower.local` | Hostnames you use to reach the dashboard. IP addresses always work. |
| `ENABLE_BROWSER_VIEW` | `true` | Set to `false` to switch off port 6080 once you're logged in. |
| `TZ` | `Etc/UTC` | Timezone for log timestamps |
| `DATA_PATH` | `/mnt/user/appdata/twitch-drops-farmer` | Where settings and the browser profile are kept |

The dashboard itself has no password. Anyone on your network can open it, so don't forward its ports to the internet. Expect roughly 0.5–1 GB of RAM and a little CPU, since the stream plays at 160p.

## How it works

- **Campaigns and progress.** The farmer opens your Drops Campaigns and Inventory pages in a background tab and reads the data the site loads there. It never calls Twitch's private API itself. That tab blocks video so it never counts as a second viewer.
- **Choosing a stream.** For the highest-priority game with something left to earn, it searches the game's directory with the "Drops enabled" filter. If a campaign only counts specific channels, it picks one of those.
- **Watching.** Every 30 seconds it checks that the video is advancing and that the stream is still in the right category. A stuck player is reloaded once. After that the channel is skipped for 15 minutes. If 25 minutes pass with no drop progress, the channel is skipped for an hour.
- **Claiming.** Every 5 minutes it reloads the inventory and clicks any **Claim** buttons. You can turn this off with **Auto-claim**.

## Settings

`config.json` is created when you first pick games. Besides the game list, you can change:

| Key | Default | Meaning |
| --- | --- | --- |
| `port` | `8411` | Dashboard port (bound to 127.0.0.1 when run locally) |
| `inventoryRefreshMinutes` | `5` | How often to check progress and claim drops |
| `campaignRefreshMinutes` | `30` | How often to reload the campaign list |
| `headless` | `false` | Hide the browser window. Only use this after you've logged in once. |

## Limitations

Twitch changes its site often, and the farmer relies on its pages' structure. If campaigns stop showing up or claiming stops working, check the Activity log on the dashboard. The usual cause is a Twitch site update.

## Development

```bash
npm test        # parser unit tests
npm run smoke   # starts the app with a throwaway profile and checks it reaches the login step
```

CI runs both on macOS, Windows and Linux, and builds and starts the Docker image.
