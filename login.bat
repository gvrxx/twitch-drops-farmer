@echo off
rem Windows: sign in to Twitch in a normal Edge window, once per install.
cd /d "%~dp0"
node src\login.js
pause
