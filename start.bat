@echo off
rem Windows: double-click to install (first run) and start the farmer.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20 or newer is required. Get it from https://nodejs.org and try again. & pause & exit /b 1)
if not exist node_modules (call npm install || (echo Install failed. & pause & exit /b 1))
call npx playwright install chromium || (echo Browser download failed. & pause & exit /b 1)
node src\index.js --open
pause
