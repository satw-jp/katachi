param([Parameter(Mandatory=$true)][string]$CompanionRoot)
$ErrorActionPreference = 'Stop'
$testTask = Join-Path $CompanionRoot 'MINIA_OPTIMIZER'
if (!(Test-Path -LiteralPath $testTask -PathType Container)) { throw 'Isolated companion fixture missing' }
$checks = @()
foreach ($name in @('dashboard.ps1','run.ps1','stop.ps1')) {
    $path = Join-Path $testTask $name
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors) | Out-Null
    if ($errors.Count -ne 0) { throw "Syntax error in $name" }
    $checks += @{name=$name;syntax='PASS'}
}
$lock = [IO.File]::Open((Join-Path $testTask 'running.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
    & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy Bypass -File (Join-Path $testTask 'run.ps1')
    if ($LASTEXITCODE -ne 2) { throw 'Lock test failed' }
} finally { $lock.Dispose() }
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -ExecutionPolicy Bypass -File (Join-Path $testTask 'stop.ps1')
if (!(Test-Path -LiteralPath (Join-Path $testTask 'STOP'))) { throw 'STOP request missing' }
@{syntax=$checks;exclusive_lock_exit=2;stop_request='PASS';search_executions=0;gui='UNVERIFIED';checkpoint_resume='NOT_EXECUTED'} | ConvertTo-Json -Depth 5
