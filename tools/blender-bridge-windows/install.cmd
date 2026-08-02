@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Please keep all files in the extracted folder and try again.
  pause
  exit /b 1
)
echo.
echo Hikari Blender Bridge is ready.
pause
