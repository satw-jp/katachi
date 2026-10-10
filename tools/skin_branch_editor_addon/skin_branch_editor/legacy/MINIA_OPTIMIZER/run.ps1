$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$lockPath = Join-Path $taskRoot 'running.lock'
$lockHandle = $null
$executionRecord = $null
try {
    try { $lockHandle = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) }
    catch { exit 2 }
    $executionId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
    $historyRoot = Join-Path $taskRoot 'execution_history'
    New-Item -ItemType Directory -Path $historyRoot -Force | Out-Null
    $executionRecord = [ordered]@{ id=$executionId; started_utc=[DateTime]::UtcNow.ToString('o'); ended_utc=$null; outcome='RUNNING' }
    $executionRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'execution.json') -Encoding UTF8
    $blenderPath = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
    $config = Get-Content -LiteralPath (Join-Path $taskRoot 'settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $taskRoot $config.source_blend))
    $scriptPath = Join-Path $taskRoot 'optimizer.py'
    $runLog = Join-Path $taskRoot 'run.log'
    $stopPath = Join-Path $taskRoot 'STOP'
    if (Test-Path -LiteralPath $stopPath) { Remove-Item -LiteralPath $stopPath }
    & $blenderPath --background --factory-startup $sourcePath --python $scriptPath *> $runLog
    $state = Get-Content -LiteralPath (Join-Path $taskRoot 'status.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $state.stage -ne 'PENDING_REOPEN_VERIFY') { throw "Optimizer failed; inspect status.json and run.log" }
    $pending = Get-Content -LiteralPath (Join-Path $taskRoot 'pending_verify.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    & $blenderPath --background --factory-startup $pending.output --python $scriptPath -- --verify *> (Join-Path $taskRoot 'verify.log')
    $state = Get-Content -LiteralPath (Join-Path $taskRoot 'status.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $state.stage -ne 'VERIFIED') { throw "Reopen verification failed; inspect status.json and verify.log" }
    $shellLink = New-Object -ComObject WScript.Shell
    $openLink = $shellLink.CreateShortcut((Join-Path $taskRoot 'OPEN_LATEST.lnk'))
    $openLink.TargetPath = $blenderPath
    $bootstrapPath = [System.IO.Path]::GetFullPath((Join-Path $taskRoot $config.bootstrap))
    $openLink.Arguments = '--factory-startup "' + $pending.output + '" --python "' + $bootstrapPath + '"'
    $openLink.WorkingDirectory = $taskRoot
    $openLink.Description = 'Open the latest verified MINI_A optimizer result'
    $openLink.Save()
    $executionRecord.outcome = 'VERIFIED'
} catch {
    if ($null -ne $executionRecord) { $executionRecord.outcome = 'FAILED' }
    $failureMessage = $_.Exception.Message
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $taskRoot 'runner_error.txt') -Encoding UTF8
    $lastState = $null
    try { $lastState = Get-Content -LiteralPath (Join-Path $taskRoot 'status.json') -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
    if ($null -eq $lastState -or $lastState.stage -ne 'FAILED') {
        @{stage='FAILED';time_utc=[DateTime]::UtcNow.ToString('o');error=$failureMessage} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'status.json') -Encoding UTF8
    }
    exit 1
} finally {
    if ($null -ne $executionRecord) {
        $executionRecord.ended_utc = [DateTime]::UtcNow.ToString('o')
        $executionRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRoot 'execution.json') -Encoding UTF8
        $executionRecord | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $historyRoot ($executionId+'.json')) -Encoding UTF8
        foreach ($logName in @('run.log','verify.log')) {
            $logPath = Join-Path $taskRoot $logName
            if (Test-Path -LiteralPath $logPath) { Copy-Item -LiteralPath $logPath -Destination (Join-Path $historyRoot ($executionId+'_'+$logName)) }
        }
    }
    if ($null -ne $lockHandle) { $lockHandle.Dispose() }
}
