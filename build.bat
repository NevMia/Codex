@echo off
setlocal

if exist package-lock.json (
  npm ci
) else (
  npm install
)
if errorlevel 1 exit /b 1

npm run build
