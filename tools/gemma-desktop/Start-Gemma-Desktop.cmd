@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to run Gemma Desktop.
  pause
  exit /b 1
)
start "Gemma Desktop Server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "Gemma Desktop" http://127.0.0.1:3210/
