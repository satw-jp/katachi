$ErrorActionPreference = "Stop"
$sourceDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExecutable = Join-Path $sourceDirectory "Hikari Blender Bridge.exe"
if (-not (Test-Path $sourceExecutable)) {
  throw "Hikari Blender Bridge.exe が同じフォルダにありません。zipをすべて展開してから実行してください。"
}

$installDirectory = Join-Path $env:LOCALAPPDATA "Programs\Hikari Blender Bridge"
$installedExecutable = Join-Path $installDirectory "Hikari Blender Bridge.exe"
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item $sourceExecutable $installedExecutable -Force
Copy-Item (Join-Path $sourceDirectory "uninstall.ps1") $installDirectory -Force

$protocol = "HKCU:\Software\Classes\hikari-blender"
New-Item $protocol -Force | Out-Null
Set-Item -Path $protocol -Value "URL:Hikari Blender Bridge"
New-ItemProperty $protocol -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
$command = Join-Path $protocol "shell\open\command"
New-Item $command -Force | Out-Null
Set-Item -Path $command -Value ('"{0}" "%1"' -f $installedExecutable)

$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$shortcutPath = Join-Path $startMenu "Hikari Blender Bridge.lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $installedExecutable
$shortcut.WorkingDirectory = $installDirectory
$shortcut.Save()

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\HikariBlenderBridge"
New-Item $uninstallKey -Force | Out-Null
New-ItemProperty $uninstallKey -Name "DisplayName" -Value "Hikari Blender Bridge" -PropertyType String -Force | Out-Null
New-ItemProperty $uninstallKey -Name "DisplayVersion" -Value "0.32.0" -PropertyType String -Force | Out-Null
New-ItemProperty $uninstallKey -Name "Publisher" -Value "Atsushi Sato" -PropertyType String -Force | Out-Null
New-ItemProperty $uninstallKey -Name "InstallLocation" -Value $installDirectory -PropertyType String -Force | Out-Null
New-ItemProperty $uninstallKey -Name "UninstallString" -Value ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $installDirectory "uninstall.ps1")) -PropertyType String -Force | Out-Null
New-ItemProperty $uninstallKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty $uninstallKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null

$report = Join-Path $env:TEMP "hikari-blender-bridge-self-test.json"
$selfTest = Start-Process `
  -FilePath $installedExecutable `
  -ArgumentList @("--self-test-report", ('"{0}"' -f $report)) `
  -Wait `
  -PassThru
if ($selfTest.ExitCode -ne 0 -or -not (Test-Path $report)) {
  throw "Bridgeの自己診断に失敗しました。"
}
Write-Host (Get-Content $report -Raw)
Write-Host "Hikari Blender Bridgeをインストールしました。"
Start-Process $installedExecutable
