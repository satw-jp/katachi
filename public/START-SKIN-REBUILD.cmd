@echo off
title SKIN REBUILD
if not exist "%~dp0START-SKIN-REBUILD.cjs" (
  echo SKIN REBUILD files are missing.
  echo.
  echo Do not run this file inside the ZIP preview.
  echo Right-click the ZIP, choose "Extract All", then run the extracted CMD.
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0skin-rebuild.html" (
  echo SKIN REBUILD files are incomplete.
  echo Extract the whole ZIP into a new empty folder and try again.
  pause
  exit /b 1
)
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to start SKIN REBUILD.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)
echo Starting SKIN REBUILD...
node "%~dp0START-SKIN-REBUILD.cjs"
if errorlevel 1 (
  echo.
  echo SKIN REBUILD stopped because of the error shown above.
  pause
)
