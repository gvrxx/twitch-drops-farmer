# Runs the farmer with a real (non-headless) browser on a virtual display.
# Port 8411: dashboard. Port 6080: browser view in your web browser (noVNC),
# used to log in to Twitch once and to peek at what it's watching.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends x11vnc novnc websockify \
 && rm -rf /var/lib/apt/lists/*

# Google Chrome plays Twitch's H.264 streams reliably; it's only published for
# x86-64, so other platforms fall back to the bundled Chromium.
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      npx -y playwright@1.64.1 install --with-deps chrome && rm -rf /var/lib/apt/lists/*; \
    fi

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DATA_DIR=/data \
    BIND_HOST=0.0.0.0 \
    PORT=8411 \
    BROWSER_VIEW_PORT=6080
VOLUME /data
EXPOSE 8411 6080
ENTRYPOINT ["/entrypoint.sh"]
