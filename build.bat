@echo off
setlocal
npm ci
if errorlevel 1 exit /b 1
npm run build
