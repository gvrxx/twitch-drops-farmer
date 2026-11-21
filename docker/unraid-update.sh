#!/bin/bash
# One-click update for Drops Farmer on Unraid, meant for the User Scripts plugin.
# Logs in to GitHub's registry, downloads the newest image, and recreates the
# container only if there's a new version. Settings and your Twitch login are
# kept in the data folder, so nothing is lost.
#
# Set these once, to match how you started the container.
VNC_PASSWORD='change-me'
TZ='Europe/London'
ALLOWED_HOSTS='tower,tower.local'
DATA_PATH='/mnt/user/appdata/twitch-drops-farmer'
# A GitHub token (classic) with only read:packages, saved in this file on the
# flash drive so it survives reboots. Create the file once; see the README.
TOKEN_FILE='/boot/config/drops-farmer-github-token'
GITHUB_USER='gvrxx'

NAME='twitch-drops-farmer'
IMAGE='ghcr.io/gvrxx/twitch-drops-farmer:latest'

set -u

if [ ! -s "$TOKEN_FILE" ]; then
  echo "No token found at $TOKEN_FILE. Save your GitHub token there first (see the README)."
  exit 1
fi
if ! docker login ghcr.io -u "$GITHUB_USER" --password-stdin < "$TOKEN_FILE" > /dev/null 2>&1; then
  echo "GitHub refused the token in $TOKEN_FILE. It may have expired; create a new one and save it there."
  exit 1
fi

before=$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || true)
echo "Checking for a new version..."
if ! docker pull -q "$IMAGE" > /dev/null; then
  echo "Couldn't download $IMAGE. Check the server's internet connection."
  exit 1
fi
after=$(docker image inspect --format '{{.Id}}' "$IMAGE")
running=$(docker inspect --format '{{.Image}}' "$NAME" 2>/dev/null || true)
version=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$IMAGE" 2>/dev/null)

if [ "$running" = "$after" ]; then
  echo "Already up to date (version ${version:-unknown})."
  exit 0
fi

[ -n "$running" ] && echo "Updating to version ${version:-unknown}..." || echo "Installing version ${version:-unknown}..."
docker rm -f "$NAME" > /dev/null 2>&1
docker run -d --name "$NAME" --restart unless-stopped --init --shm-size=1g \
  -p 8411:8411 -p 6080:6080 \
  -e TZ="$TZ" -e VNC_PASSWORD="$VNC_PASSWORD" -e ALLOWED_HOSTS="$ALLOWED_HOSTS" \
  -v "$DATA_PATH":/data \
  "$IMAGE" > /dev/null || { echo "Couldn't start the container."; exit 1; }

# The old image is no longer used by anything.
[ -n "$before" ] && [ "$before" != "$after" ] && docker image rm "$before" > /dev/null 2>&1
echo "Done. Drops Farmer ${version:-} is running."
