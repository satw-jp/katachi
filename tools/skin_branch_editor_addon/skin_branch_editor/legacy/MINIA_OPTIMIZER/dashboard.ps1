param([switch]$SelfTest)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$script:root=$PSScriptRoot
$script:cache=@{}
$script:observedStart=[DateTime]::UtcNow
$script:launchPending=$null
$script:latestPath=$null
$script:historySignature=''
$script:busy=$false
$script:testFixtures=@{}

function Read-JsonFile($name) {
    if($SelfTest -and $script:testFixtures.ContainsKey($name)){return $script:testFixtures[$name]}
    $path=Join-Path $script:root $name
    try {
        $item=Get-Item -LiteralPath $path -ErrorAction Stop
        $stamp=$item.LastWriteTimeUtc.Ticks.ToString()+':'+$item.Length
        if (!$script:cache.ContainsKey($name) -or $script:cache[$name].Stamp -ne $stamp) {
            $value=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
            $script:cache[$name]=@{Stamp=$stamp;Value=$value}
        }
        return $script:cache[$name].Value
    } catch {
        if ($script:cache.ContainsKey($name)) { return $script:cache[$name].Value }
        return $null
    }
}
function Test-Running {
    if($SelfTest -and $script:simulateRunning){return $true}
    $path=Join-Path $script:root 'running.lock'
    if (!(Test-Path -LiteralPath $path)) { return $false }
    try { $probe=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$probe.Dispose();return $false }
    catch [IO.IOException] { return $true }
}
function Format-Duration($span) { return ('{0:00}:{1:00}:{2:00}' -f [math]::Floor($span.TotalHours),$span.Minutes,$span.Seconds) }
function Open-Result($path) {
    if (!$path -or !(Test-Path -LiteralPath $path)) { [Windows.Forms.MessageBox]::Show('開ける検証済みファイルがありません。');return }
    $cfg=Read-JsonFile 'settings.json'
    $bootstrap=[IO.Path]::GetFullPath((Join-Path $script:root $cfg.bootstrap))
    Start-Process -FilePath 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' -ArgumentList ('--factory-startup "'+$path+'" --python "'+$bootstrap+'"')
}
function New-Label($text,$size=11,$bold=$false) {
    $label=New-Object Windows.Forms.Label
    $label.Text=$text;$label.AutoSize=$false;$label.Dock='Fill';$label.TextAlign='MiddleLeft';$label.Margin=New-Object Windows.Forms.Padding(8)
    $style=[Drawing.FontStyle]::Regular;if($bold){$style=[Drawing.FontStyle]::Bold}
    $label.Font=New-Object Drawing.Font('Yu Gothic UI',$size,$style)
    return $label
}
function New-Button($text,$width) {
    $button=New-Object Windows.Forms.Button;$button.Text=$text;$button.Width=$width;$button.Height=42;$button.Margin=New-Object Windows.Forms.Padding(0,0,12,0)
    $button.FlatStyle='Flat';$button.BackColor=[Drawing.Color]::FromArgb(48,57,72);$button.ForeColor=[Drawing.Color]::White
    return $button
}
$form=New-Object Windows.Forms.Form
$form.Text='MINI_A 自動改善';$form.Size=New-Object Drawing.Size(1100,800);$form.MinimumSize=New-Object Drawing.Size(900,720)
$form.StartPosition='CenterScreen';$form.BackColor=[Drawing.Color]::FromArgb(25,30,39);$form.ForeColor=[Drawing.Color]::FromArgb(229,234,241)
$form.Font=New-Object Drawing.Font('Yu Gothic UI',11)
$layout=New-Object Windows.Forms.TableLayoutPanel;$layout.Dock='Fill';$layout.Padding=New-Object Windows.Forms.Padding(20);$layout.ColumnCount=1;$layout.RowCount=10
foreach($height in @(52,44,52,36,88,64,60,34)){$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',$height)))|Out-Null}
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Percent',100)))|Out-Null
$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle('Absolute',46)))|Out-Null
$form.Controls.Add($layout)
$title=New-Label 'MINI_A  /  自動改善モニター' 21 $true;$layout.Controls.Add($title,0,0)
$stateLabel=New-Label '状態を読み込み中…' 15 $true;$layout.Controls.Add($stateLabel,0,1)
$buttons=New-Object Windows.Forms.FlowLayoutPanel;$buttons.Dock='Fill';$buttons.Padding=New-Object Windows.Forms.Padding(8,4,0,0)
$start=New-Button '▶ スタート / 再開' 190;$stop=New-Button '■ ストップして保存' 200;$openLatest=New-Button '最新の検証済み結果を開く' 250
$buttons.Controls.AddRange(@($start,$stop,$openLatest));$layout.Controls.Add($buttons,0,2)
$timeLabel=New-Label '時間：—';$layout.Controls.Add($timeLabel,0,3)
$metrics=New-Label '進捗を読み込み中…' 13;$layout.Controls.Add($metrics,0,4)
$detail=New-Label '計算は裏で実行します。GUIを閉じても計算は続きます。' 10;$layout.Controls.Add($detail,0,5)
$latest=New-Label '最新の検証済みファイル：—' 11;$latest.AutoEllipsis=$true;$layout.Controls.Add($latest,0,6)
$historyTitle=New-Label '各回の保存結果  —  ダブルクリックで開く（検証済みのみ）' 11 $true;$layout.Controls.Add($historyTitle,0,7)
$history=New-Object Windows.Forms.ListView;$history.Dock='Fill';$history.View='Details';$history.FullRowSelect=$true;$history.MultiSelect=$false;$history.HideSelection=$false
$history.BackColor=[Drawing.Color]::FromArgb(34,40,51);$history.ForeColor=$form.ForeColor;$history.BorderStyle='None'
foreach($col in @(@('回',55),@('保存日時',165),@('検証',85),@('採用本数',90),@('赤の総延長 mm',145),@('ファイル',440))){$history.Columns.Add($col[0],[int]$col[1])|Out-Null}
$layout.Controls.Add($history,0,8)
$bottom=New-Object Windows.Forms.FlowLayoutPanel;$bottom.Dock='Fill';$bottom.Padding=New-Object Windows.Forms.Padding(8,6,0,0)
$folder=New-Button '保存フォルダ' 150;$folder.Height=32;$guide=New-Button '使い方' 100;$guide.Height=32
$bottom.Controls.AddRange(@($folder,$guide));$layout.Controls.Add($bottom,0,9)
$tooltips=New-Object Windows.Forms.ToolTip
$tooltips.SetToolTip($stop,'現在の候補評価を終え、採用済みの結果を保存・検証してから止まります。')
$tooltips.SetToolTip($start,'現在の保存済みチェックポイントから計算を続けます。二重起動はしません。')

function Update-Dashboard {
    $running=Test-Running;$now=[DateTime]::UtcNow
    $pending=$null -ne $script:launchPending -and ($now-$script:launchPending).TotalSeconds -lt 15
    if($running){$script:launchPending=$null}
    $script:busy=$running -or $pending
    $s=Read-JsonFile 'status.json';$j=Read-JsonFile 'checkpoint.json';$e=Read-JsonFile 'execution.json';$cfg=Read-JsonFile 'settings.json'
    $stopping=$running -and (Test-Path -LiteralPath (Join-Path $script:root 'STOP'))
    $names=@{COUNTING_FLOWER_SUPPORTS='花から奥への支持経路を確認中';SEARCHING='改善候補を探索中';ACCEPTED='改善する接続を採用';SAVING='結果を保存中';PENDING_REOPEN_VERIFY='保存結果を再読み込み・検証中';VERIFIED='保存・検証が完了';FAILED='エラーで停止'}
    if($pending -and !$running){$stateLabel.Text='● 起動中…'}
    elseif($running){$phase=$names[[string]$s.stage];if(!$phase){$phase='処理中'};$stateLabel.Text='● 実行中  /  '+$phase;if($stopping){$stateLabel.Text='● 停止を受け付けました  /  評価・保存・検証が終わるまでお待ちください'}}
    elseif($s.stage -eq 'FAILED'){$stateLabel.Text='● エラーで停止  /  前の検証済み結果は残っています'}
    elseif($s.stage -eq 'VERIFIED'){$stateLabel.Text='● 停止中  /  保存・検証が完了しています'}
    else{$stateLabel.Text='● 停止中  /  現在、計算プロセスは動いていません'}
    $stateLabel.ForeColor=if($script:busy){[Drawing.Color]::FromArgb(92,203,245)}elseif($s.stage -eq 'FAILED'){[Drawing.Color]::Salmon}else{[Drawing.Color]::FromArgb(114,223,161)}
    $start.Enabled=!$script:busy;$stop.Enabled=$running -and !$stopping -and $s.stage -notin @('SAVING','PENDING_REOPEN_VERIFY','VERIFIED')
    $clockText='監視開始から '+(Format-Duration ($now-$script:observedStart))+'（この実行の開始時刻は未記録）'
    if(!$script:busy){$clockText='計算時間：この実行は未記録（次回から自動計測）'}
    if($e -and $e.started_utc -and (!$running -or !$e.ended_utc)){
        $from=[DateTime]::Parse($e.started_utc).ToUniversalTime();$to=$now;if($e.ended_utc){$to=[DateTime]::Parse($e.ended_utc).ToUniversalTime()}
        $clockText='今回の計算時間 '+(Format-Duration ($to-$from))+'  /  開始 '+$from.ToLocalTime().ToString('MM/dd HH:mm:ss')
    }
    $age='—';if($s.time_utc){$age=[math]::Max(0,[math]::Floor(($now-[DateTime]::Parse($s.time_utc).ToUniversalTime()).TotalSeconds)).ToString()+'秒前'}
    $timeLabel.Text=$clockText+'  /  最終進捗更新 '+$age
    if($j){
        $cur=$j.current;if(!$cur){$cur=$j.baseline};$base=$j.baseline
        $flowerBefore=[int]$base.flower_support_2+[int]$base.flower_support_3_or_more;$flowerAfter=[int]$cur.flower_support_2+[int]$cur.flower_support_3_or_more
        $metrics.Text=('第{0}回  ・  累計採用 {1}本  ・  探索 {2}周目' -f $j.runs,@($j.accepted).Count,$j.round)+[Environment]::NewLine+('赤の総延長  {0:N2} → {1:N2} mm   /   奥から2系統以上の花  {2} → {3} 個' -f $base.red_length_mm,$cur.red_length_mm,$flowerBefore,$flowerAfter)
    }
    $reasons=@{RED_ZERO='赤ゼロ達成';RUN_BUDGET='今回の評価上限。スタートで続きます';USER_STOP='停止操作により保存して終了';NO_IMPROVING_CANDIDATE_IN_THIS_NEIGHBORHOOD='現在の候補範囲で改善なし';LINK_LIMIT='追加本数の上限に到達';ROUND_LIMIT='周回上限に到達'}
    $reason=$reasons[[string]$j.stop_reason]
    if($script:busy){$detail.Text='進捗は2秒ごとに更新。所要時間は候補によって変わるため、残り時間は未確定です。'+[Environment]::NewLine+'ストップは強制終了ではなく、採用済み結果を保存してから終了します。'}
    else{$detail.Text='終了理由：'+$reason+[Environment]::NewLine+'終了＝赤ゼロとは限りません。各回の結果は上書きせず残します。'}
    if($s.stage -eq 'FAILED' -and !$running){$detail.Text='エラー：'+$s.error}
    $files=@(Get-ChildItem -LiteralPath $script:root -Filter 'MINIA_AUTO_100_RUN_*.blend' | Sort-Object Name -Descending)
    $signature=($files | ForEach-Object { $_.Name+':'+$_.LastWriteTimeUtc.Ticks }) -join '|'
    $reports=@(Get-ChildItem -LiteralPath $script:root -Filter 'RUN_*.json');$signature+='|'+(($reports|ForEach-Object{$_.Name+':'+$_.LastWriteTimeUtc.Ticks})-join '|')
    if($signature -ne $script:historySignature){
        $history.BeginUpdate();$history.Items.Clear();$script:latestPath=$null;$script:latestRow=$null
        foreach($file in $files){
            $number=[int]([regex]::Match($file.Name,'RUN_(\d+)').Groups[1].Value)
            $report=Read-JsonFile ('RUN_{0:000}.json' -f $number)
            $ok=$report -and $report.verified -eq $true
            $state=if($ok){'検証済み'}else{'未検証'}
            $row=New-Object Windows.Forms.ListViewItem($number.ToString())
            $row.SubItems.Add($file.LastWriteTime.ToString('MM/dd HH:mm:ss'))|Out-Null;$row.SubItems.Add($state)|Out-Null
            $row.SubItems.Add($(if($report){[string]$report.accepted_total}else{'—'}))|Out-Null
            $row.SubItems.Add($(if($report){'{0:N2}' -f $report.after.red_length_mm}else{'—'}))|Out-Null;$row.SubItems.Add($file.Name)|Out-Null
            $row.Tag=@{Path=$file.FullName;Verified=$ok};if(!$ok){$row.ForeColor=[Drawing.Color]::Khaki}
            $history.Items.Add($row)|Out-Null
            if($ok -and !$script:latestPath){$script:latestPath=$file.FullName;$script:latestRow=$number}
        }
        $history.EndUpdate();$script:historySignature=$signature
    }
    $openLatest.Enabled=$null -ne $script:latestPath
    if($script:latestPath){$latest.Text='最新の検証済み結果：第'+$script:latestRow+'回'+[Environment]::NewLine+$script:latestPath;$tooltips.SetToolTip($latest,$script:latestPath)}else{$latest.Text='最新の検証済み結果：まだありません'}
}
$start.Add_Click({
    try {
        if(Test-Running){Update-Dashboard;return}
        $ps=(Get-Command powershell.exe).Source
        Start-Process -FilePath $ps -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $script:root 'run.ps1')+'"') -WindowStyle Hidden
        $script:launchPending=[DateTime]::UtcNow;Update-Dashboard
    } catch {[Windows.Forms.MessageBox]::Show($_.Exception.Message,'開始できませんでした')|Out-Null}
})
$stop.Add_Click({try{if(Test-Running){Set-Content -LiteralPath (Join-Path $script:root 'STOP') -Value 'stop and save' -Encoding UTF8};Update-Dashboard}catch{[Windows.Forms.MessageBox]::Show($_.Exception.Message)|Out-Null}})
$openLatest.Add_Click({Open-Result $script:latestPath})
$history.Add_DoubleClick({if($history.SelectedItems.Count){$item=$history.SelectedItems[0].Tag;if($item.Verified){Open-Result $item.Path}else{[Windows.Forms.MessageBox]::Show('この結果はまだ検証を通っていません。最新の検証済み結果をご利用ください。')|Out-Null}}})
$folder.Add_Click({Start-Process explorer.exe -ArgumentList ('"'+$script:root+'"')})
$guide.Add_Click({Start-Process notepad.exe -ArgumentList ('"'+(Join-Path $script:root 'README.txt')+'"')})
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2000
$timer.Add_Tick({try{Update-Dashboard}catch{$detail.Text='表示の読み取りを再試行します：'+$_.Exception.Message}})
$form.Add_FormClosed({$timer.Stop();$timer.Dispose()})
Update-Dashboard
if($SelfTest){
    $actualBusy=$script:busy
    $script:simulateRunning=$true
    $script:testFixtures['status.json']=[pscustomobject]@{stage='SEARCHING';time_utc=[DateTime]::UtcNow.ToString('o')}
    $script:testFixtures['execution.json']=[pscustomobject]@{started_utc=[DateTime]::UtcNow.AddSeconds(-65).ToString('o');ended_utc=$null}
    Update-Dashboard
    if($start.Enabled -or !$timeLabel.Text.Contains('00:01:05')){throw 'Running controls or elapsed clock failed'}
    $script:simulateRunning=$false;$script:testFixtures.Clear();Update-Dashboard
    $form.Show();[Windows.Forms.Application]::DoEvents()
    $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
    $bitmap.Save((Join-Path $script:root 'GUI_PREVIEW.png'));$bitmap.Dispose()
    if($history.Items.Count -lt 1 -or !$script:latestPath){throw 'History/latest result was not populated'}
    if($script:busy -and $start.Enabled){throw 'Start must be disabled while running'}
    @{result='GUI_SELFTEST_PASS';running=$script:busy;history_count=$history.Items.Count;latest=$script:latestPath;state=$stateLabel.Text;running_controls_and_clock='PASS'}|ConvertTo-Json
    $form.Close();$form.Dispose();exit
}
$timer.Start();[Windows.Forms.Application]::Run($form)
