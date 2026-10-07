param([string]$Python = $env:SKIN_CREATION_PYTHON, [string]$Vendor = $env:ASTRA_RESEARCH_VENDOR, [int]$UiPort = 5196, [int]$ApiPort = 5197)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $Python) { $Python = 'C:/Users/as/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' }
if (-not $Vendor) { $Vendor = 'J:/My Drive/codex/2026-09-05/files-mentioned-by-the-user-samples/work/r2/vendor' }
if (-not (Test-Path -LiteralPath $Python)) { throw 'Set SKIN_CREATION_PYTHON to your Python runtime.' }
if (Test-Path -LiteralPath $Vendor) { $env:PYTHONPATH = $Vendor }
$env:PYTHONIOENCODING = 'utf-8'
$env:SKIN_CREATION_UI_PORT = [string]$UiPort
$env:SKIN_CREATION_API_PORT = [string]$ApiPort
$used = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $UiPort,$ApiPort }
if ($used) { throw "$UiPort/$ApiPort already in use. Existing environments were not stopped." }
Set-Location -LiteralPath $repoPath
$engineProcess = Start-Process -FilePath $Python -ArgumentList @('"' + (Join-Path $PSScriptRoot 'server.py') + '"', '--port', [string]$ApiPort) -WindowStyle Hidden -PassThru
try { & npm.cmd run dev -- --config vite.creation.config.ts }
finally { if (-not $engineProcess.HasExited) { Stop-Process -Id $engineProcess.Id } }
