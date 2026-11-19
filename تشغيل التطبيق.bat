@echo off
chcp 65001 >nul
title Mawredin - localhost:3000
cd /d "%~dp0local-server"
where node >nul 2>nul || (echo Node.js is not installed. Download it from https://nodejs.org then run this file again. & pause & exit /b)
if not exist node_modules (
  echo Installing - first time only...
  call npm install --omit=dev
)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node server.js
pause
