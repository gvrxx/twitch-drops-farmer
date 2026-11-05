#!/usr/bin/env bash
set -euo pipefail

export DISPLAY=:99
mkdir -p "$DATA_DIR"

# Leftovers from an unclean stop would block the display or the profile.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
rm -f "$DATA_DIR"/browser-profile/Singleton{Lock,Cookie,Socket}

Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
for _ in $(seq 1 50); do
  [ -e /tmp/.X11-unix/X99 ] && break
  sleep 0.1
done

if [ -z "${BROWSER_CHANNEL:-}" ] && [ -x /opt/google/chrome/chrome ]; then
  export BROWSER_CHANNEL=chrome
fi

if [ "${ENABLE_BROWSER_VIEW:-true}" = "true" ]; then
  if [ -n "${VNC_PASSWORD:-}" ]; then
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null
    vnc_auth=(-rfbauth /tmp/vncpass)
  else
    echo "WARNING: VNC_PASSWORD is not set. Anyone on your network can open the browser view on port ${BROWSER_VIEW_PORT} and use your logged-in Twitch session."
    vnc_auth=(-nopw)
  fi
  x11vnc -display :99 -forever -shared -localhost -rfbport 5900 -quiet "${vnc_auth[@]}" >/dev/null 2>&1 &
  websockify --web /usr/share/novnc "$BROWSER_VIEW_PORT" localhost:5900 >/dev/null 2>&1 &
  echo "Browser view: http://<server-ip>:${BROWSER_VIEW_PORT}/vnc.html"
else
  unset BROWSER_VIEW_PORT
fi

exec node /app/src/index.js
