@echo off
rem Starts the talent console on this computer only, with demo data, and opens it in the browser.
rem For real WeCom data: copy wecom-config.example.json to wecom-config.json, fill it in, then run "node server.js --open".
rem Close this window to stop it.
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or later, then run this file again.
  pause
  exit /b 1
)
node server.js --mock --open
pause
