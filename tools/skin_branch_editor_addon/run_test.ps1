param(
    [Parameter(Mandatory=$true)][string]$EvidenceRoot,
    [Parameter(Mandatory=$true)][ValidateSet('lifecycle','copy','reopen','synthetic')][string]$Phase,
    [string]$BlenderExe = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
)
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath($EvidenceRoot)
foreach ($name in @('config-test','scripts-test','extensions-test')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $testRoot $name) | Out-Null
}
$env:BLENDER_USER_CONFIG = Join-Path $testRoot 'config-test'
$env:BLENDER_USER_SCRIPTS = Join-Path $testRoot 'scripts-test'
$env:BLENDER_USER_EXTENSIONS = Join-Path $testRoot 'extensions-test'
$testScript = Join-Path $PSScriptRoot 'test_blender.py'
$argv = @('--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',$testScript,'--','--phase',$Phase,'--evidence',$testRoot)
& $BlenderExe @argv
if ($LASTEXITCODE -ne 0) { throw "Isolated $Phase test failed" }
