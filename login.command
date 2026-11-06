#!/bin/bash
# macOS: sign in to Twitch in a normal Chrome window, once per install.
cd "$(dirname "$0")" || exit 1
node src/login.js
