#!/bin/bash
# Updates all your apps on Unraid in one go, meant for the User Scripts plugin.
# For each app below it downloads the newest image and recreates the container
# only if there's a new version. Data in each app's folders is kept.

# Only needed for private images: a GitHub token (classic) with only
# read:packages, saved on the flash drive so it survives reboots. Public images,
# such as Drops Farmer's, need no token; without this file the login is skipped.
TOKEN_FILE='/boot/config/drops-farmer-github-token'
GITHUB_USER='gvrxx'
# This server's address on your network, for links Unraid shows (such as app icons).
SERVER_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')

# ---- Your apps ----
# One "app" entry per container: its name, its image, then the same options you
# would give `docker run` (without `docker run -d --name ...` and the image).
apps() {
  app twitch-drops-farmer ghcr.io/gvrxx/twitch-drops-farmer:latest \
    --restart unless-stopped --init --shm-size=1g \
    -p 8411:8411 -p 6080:6080 \
    -e TZ='Europe/London' -e VNC_PASSWORD='change-me' -e ALLOWED_HOSTS='tower,tower.local' \
    -v /mnt/user/appdata/twitch-drops-farmer:/data \
    -l net.unraid.docker.icon="http://$SERVER_IP:8411/icon.png"

  # To add another app, copy the block above and change it, for example:
  # app my-other-app ghcr.io/gvrxx/my-other-app:latest \
  #   --restart unless-stopped -p 8500:8500 \
  #   -v /mnt/user/appdata/my-other-app:/data
}
# ---- End of your apps ----

failed=0

login() {
  [ -s "$TOKEN_FILE" ] || return 0
  if ! docker login ghcr.io -u "$GITHUB_USER" --password-stdin < "$TOKEN_FILE" > /dev/null 2>&1; then
    echo "GitHub refused the token in $TOKEN_FILE. It may have expired; create a new one and save it there."
    exit 1
  fi
}

# app NAME IMAGE [docker run options...]
app() {
  local name="$1" image="$2"
  shift 2
  local before after running version
  before=$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null)
  if ! docker pull -q "$image" > /dev/null 2>&1; then
    echo "$name: couldn't download $image."
    failed=1
    return
  fi
  after=$(docker image inspect --format '{{.Id}}' "$image")
  running=$(docker inspect --format '{{.Image}}' "$name" 2>/dev/null)
  version=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "$image" 2>/dev/null)
  version="${version:-${after:7:12}}"

  if [ "$running" = "$after" ]; then
    echo "$name: up to date ($version)."
    return
  fi
  docker rm -f "$name" > /dev/null 2>&1
  if ! docker run -d --name "$name" "$@" "$image" > /dev/null; then
    echo "$name: couldn't start the container. Check its options in this script."
    failed=1
    return
  fi
  [ -n "$running" ] && echo "$name: updated to $version." || echo "$name: installed $version."
  # The old image is no longer used by this app; Docker keeps it if anything else uses it.
  [ -n "$before" ] && [ "$before" != "$after" ] && docker image rm "$before" > /dev/null 2>&1
}

login
apps
exit "$failed"
