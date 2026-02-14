@echo off
setlocal

npm ci
if errorlevel 1 (
  echo npm ci failed, falling back to npm install...
  npm install
  if errorlevel 1 exit /b 1
)

npm run build
