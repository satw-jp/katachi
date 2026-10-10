# 復元・再開の手順

## 必要なもの

当時の環境はWindows、Blender 5.2.2 LTS、Blender同梱Python/NumPy/mathutils、NetworkX 3.6.1、Windows PowerShellとWindows Formsです。GitHubのコードだけでは元作品を含まないため、以下をDriveから揃えます。

1. 使用する保存済み `.blend`。最新検証済みは `outputs/MINIA_OPTIMIZER/MINIA_AUTO_100_RUN_007.blend`。
2. 新規探索／既存checkpointの再開には元入力 `outputs/MINIA_LOWER70_BRANCHING_REVIEW.blend`。
3. `outputs/COLOR_PATH_GRAPH.json.gz` と `outputs/SUPPORT_DISTANCE_COLORS.json`。
4. `outputs/color_path_runtime/networkx-3.6.1.zip`（第三者依存、元のライセンスも保持）。
5. `host.npz`。絶対パスとhashは [DRIVE_ARTIFACTS.json](../../docs/evidence/minia_author_workspace/DRIVE_ARTIFACTS.json)。
6. 再開するなら同じ探索フォルダのcheckpoint・RUN報告・結果・latest_verified・execution履歴を揃えます。Gitにある集計JSONはcheckpointの代用ではありません。

保存時点の作業ルート：

```text
J:\My Drive\codex\2026-10-09\files-pasted-by-the-user-astra
```

`.blend`本体・cache・hostはGitHubにアップロードしていません。hashは同じデータかを照合するためのもので、データそのものを復元する機能ではありません。

## 復元先の配置

作業用の新しいフォルダを用意し、この保存記録の `outputs/` をコピーします。その下へ同じ相対位置でDriveの依存物を配置します。過去の成果物の上へ無条件にコピーしないでください。

```text
復元先/
  outputs/
    MINIA_LOWER50_BOOTSTRAP.py
    MINIA_LOWER70_BRANCHING_REVIEW.blend
    COLOR_PATH_GRAPH.json.gz
    SUPPORT_DISTANCE_COLORS.json
    color_author_runtime/ ...
    color_path_runtime/networkx-3.6.1.zip
    selected_point_runtime/ quad_view_runtime/ view_clip_runtime/
    interval_delete_runtime/ route_runtime/
    MINIA_OPTIMIZER/
      optimizer.py flower_support.py straight_audit.py
      dashboard.ps1 run.ps1 stop.ps1 settings.json
      （再開時だけ元のcheckpoint、RUN結果、報告など）
```

移設時は `settings.json` のsource_blend/bootstrap/host_npz、`run.ps1` と `dashboard.ps1` のBlender実行ファイルのパスを点検します。historical_workには絶対パスが多数あるので、復元作業のために一括実行しないでください。

## 起動例

PowerShellで、`$restoreOutputs` を復元先のoutputsに置き換えます。

```powershell
$restoreOutputs = 'D:\MINIA-restored\outputs'
$blenderExe = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
& $blenderExe --factory-startup `
  (Join-Path $restoreOutputs 'MINIA_OPTIMIZER\MINIA_AUTO_100_RUN_007.blend') `
  --python (Join-Path $restoreOutputs 'MINIA_LOWER50_BOOTSTRAP.py')
```

GUIを起動：

```powershell
$windowsPowerShell = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
& $windowsPowerShell -NoProfile -STA -ExecutionPolicy Bypass `
  -File (Join-Path $restoreOutputs 'MINIA_OPTIMIZER\dashboard.ps1')
```

このExecutionPolicy指定はその起動のための既存ランチャー設定です。スクリプトを確認してから使用してください。Windows PowerShellで日本語が壊れないよう、dashboard.ps1のUTF-8 BOMを維持します。

ショートカットを作る場合、リンク先を実在するWindows PowerShellへ設定し、上記引数と作業フォルダを指定します。実行環境によって `$PSHOME` は別の同梱ランタイムを指すので、`$PSHOME\powershell.exe` を前提にしません。`.lnk`は機械ごとの絶対パスを含むためGitには保存していません。

## 確認

1. SHA-256を台帳と照合する：`Get-FileHash -Algorithm SHA256 -LiteralPath '対象ファイル'`。
2. 正しいbootstrapから開き、専用パネル、保存した1/4画面、クリップ範囲、CURRENT/HOLDを確認。
3. 編集の試験はコピー上で行い、2点→F→色更新→途中点→保存→再読込を確認。
4. ルールの単体試験は復元した依存物で次を実行：

```powershell
& $blenderExe --background --factory-startup --python `
  (Join-Path $restoreOutputs 'MINIA_OPTIMIZER\test_rules.py')
```

5. 本計算はGUIから明示的に開始。RUN_007は追加200本上限に達しています。継続条件を変更する場合、元の一式を保持した別フォルダで新しい探索にします。

同一入力に対する完全なバイト単位再生成、別PCでのGUI操作互換性、印刷可能な実体meshへの変換は今回の保存検証には含みません。Blender UI起動時のネット接続不調というAuthor報告も、原因未特定として残っています。
