param([Parameter(Mandatory=$true)][string]$EvidenceRoot, [switch]$Oracle,
      [string]$BlenderExe='C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
$ErrorActionPreference='Stop'
$testRoot=[IO.Path]::GetFullPath($EvidenceRoot)
foreach ($name in @('config-test','scripts-test','extensions-test')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot $name) | Out-Null
}
$env:BLENDER_USER_CONFIG=Join-Path $testRoot 'config-test'
$env:BLENDER_USER_SCRIPTS=Join-Path $testRoot 'scripts-test'
$env:BLENDER_USER_EXTENSIONS=Join-Path $testRoot 'extensions-test'
$argv=@('--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',(Join-Path $PSScriptRoot 'test_operations.py'),'--','--evidence',$testRoot)
if ($Oracle) { $argv += '--oracle' }
& $BlenderExe @argv
if ($LASTEXITCODE -ne 0) { throw 'Operation parity fixture failed' }
