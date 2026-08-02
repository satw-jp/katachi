$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "Programs\Hikari Blender Bridge"
$shortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Hikari Blender Bridge.lnk"
Remove-Item "HKCU:\Software\Classes\hikari-blender" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HikariBlenderBridge" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
Remove-Item $installDirectory -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Hikari Blender Bridgeをアンインストールしました。"
