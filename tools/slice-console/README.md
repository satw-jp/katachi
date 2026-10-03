# FUKEI Slice Runner

## Input contract (job schema 0.2)

`input_mode` makes the source route explicit. A job with no `input_mode` remains a readable/executable schema-0.1 legacy job.

- `mesh_import`: one ASCII or binary STL, declared `mesh.units: "mm"`, exact SHA-256 entry for that STL in `locks/INPUT_LOCKS.json`, `mesh.expected_bounds_mm`, and `mesh.intended_transform` (`translation_mm`, `rotation_deg`, positive `scale`). The Runner parses vertices/facets, rejects malformed or non-finite coordinates and bounds that disagree with the declaration (absolute tolerance 1e-6 mm), and passes the locked file unchanged to the supplied CLI argv. The transform is recorded as declared intent; the Runner does not apply it or invent CLI arguments. STL is the only mesh format validated by this release.
- `native_bambu_project`: one `.3mf` plus `provenance.native_saved: true`, `provenance.externally_reduced: false`, and `provenance.manually_repacked: false`. The Runner trusts this declaration only; it does not claim to parse or certify Bambu project structure. Missing or contradictory provenance fails before engine launch.

The terminal `RESULT_MANIFEST.json` records `input_mode`, provenance, input SHA-256, mesh counts/bounds/units/expected bounds/declared transform, and the engine's terminal status and exit code. `plate_recognition.package_parse` reports `PACKAGE_PARSE_PASS` only for a successful `--info`; the separate `plate_recognition` value remains `PRINTABLE_OBJECT_UNVERIFIED` for that route. A successful `--slice` is `SLICE_ACCEPTED`; the known `-50` empty-plate response is `SLICE_REJECTED_EMPTY_PLATE`. No `--info` success is treated as proof of a printable plate.

## 完成G-code → Bambu用3MF

独立タブで完成済み `.gcode` を選び、元の3MF設定を指定して「3MF化」を押します。run folderに `SLICE_JOB.json` があれば入力3MFを自動選択します。出力は別フォルダの `plate_1.gcode.3mf` と `PACKAGE_RESULT.json` です。Bambu engineは起動せず、G-codeはraw bytesのままZIPへ入れ、CRC・サイズ・SHA256・layer整合を検証します。package検証だけでは印刷準備完了にせず、Bambu Studioのsliced Previewで確認してください。

元の3MF設定がない場合、Studio Previewが確認できなかったためfail closedにします。`PACKAGE_RESULT.json` の `PACKAGE_COMPLETE` はpackage検証、`AUTHOR_PREVIEW_CHECK` はStudio確認待ちを意味します。printer sendとprint startは行いません。

ASTRAが準備した `SLICE_JOB.json` を読み、検証済みの native CLI をバックグラウンドで実行する小さなWindows GUIです。Bambu Studioの設定編集、printer send、actual printは行いません。

## 起動

Python 3.10以降のWindowsで、追加パッケージなしで起動できます。

```text
cd fukei_slice_runner
python app.py
# optional: start with a job already loaded
python app.py path\to\SLICE_JOB.json
```

## 普通に使う

`setup_windows.py`を一度実行してInstallすると、Desktopに作成された**FUKEI Slice Runner**をダブルクリックして起動できます。console windowは表示せず、`pythonw.exe`を優先して使用します。

```text
python setup_windows.py
```

## Windows起動時

Setup画面のInstallで、管理者権限なしのユーザーStartupへ登録されます。Startup shortcutは`app.py --startup`で起動し、GUIを最小化状態にします。

## Startup解除

Setup画面の**Remove from Startup**でStartup登録だけを解除できます。Desktop shortcutは**Remove Desktop shortcut**で削除できます。アプリ本体やslice成果物は削除しません。

Desktop/Startup shortcutはsetup実行時の`sys.executable`を基準に作成し、同じ場所に`pythonw.exe`があればそちらを使います。shortcutのworking directoryは`app.py`の場所に固定されるため、別のworking directoryやspaceを含むDrive pathからでも起動できます。

1. **選択**でASTRAが作成した `SLICE_JOB.json` を選びます。
2. Candidate、printer、layer、material、support、engineはread-onlyで表示されます。
3. Input、profiles、output、input locks、validated CLIの検証がすべてOKになると、**G-codeを書き出す**が有効になります。
4. Run中はGUIを固めず、Cancel、ログ表示、結果フォルダを開くが使えます。

## ジョブ形式とCLI authority

GUIはBambu CLIのargvを推測しません。`SLICE_JOB.json` の `cli.argv` に、既存Runbook/validated runnerが確定したargvテンプレートを入れてください。

利用できるplaceholderは次のとおりです。

```text
{engine_path} {data_dir} {job_dir} {job_path}
{output_dir} {output_root} {run_dir} {python_executable}
{input_0} {input_1} {inputs}
{profile_printer} {profiles.printer}
```

`{output_dir}` / `{run_dir}` は今回のrun専用フォルダに解決されます。`cli.cwd`、`cli.env`、`cli.version`も指定できます。`cli.argv`がないjobは実行できません。

`locks/INPUT_LOCKS.json` はデフォルトで読み込まれ、`sha256`があるentryを照合します。jobの `input_locks` で別パスを指定することもできます。

## 進捗と出力

CLIのmachine-readable JSON (`progress` / `percent` / `percentage`) を検出した場合だけ **実測進捗** と表示します。普通のログ中の `NN%` は実測進捗として扱いません。それ以外はreference duration（未指定時はD22.1相当の2971秒）からの **推定進捗** です。ログ中のphase候補は実際の出力行だけをマッピングし、存在しないログを仮定しません。

各runはjobのoutput directory下に上書きせず作成されます。

```text
runs/D22.2_20260920_153000/
├─ SLICE_JOB.json
├─ RESULT_MANIFEST.json
├─ stdout.log
├─ stderr.log
├─ RUNNER_EXECUTION_CONTEXT.json
├─ INPUT_LOCKS.json
├─ resolved_settings.json (Bambu CLIが生成した場合)
└─ output files...
```

ASTRAへ返すものはrunフォルダ一式、特に `RESULT_MANIFEST.json`、`RUNNER_EXECUTION_CONTEXT.json`、`INPUT_LOCKS.json`、`stdout.log`、`stderr.log`、CLIが生成したoutputです。`resolved_settings.json`はBambu CLIが生成した場合だけoutputとして記録されます。`RESULT_MANIFEST.json`の`execution_success`はCLI execution successだけを意味し、printable、Author ACCEPT、physical PASS、GOを意味しません。Cancelは`CANCELLED`かつ`execution_success: false`です。

`SLICE_JOB.json`の`cli.windows_execution`には`no_window`（デフォルト）または`inherit_console`を指定できます。前者は`CREATE_NO_WINDOW + CREATE_NEW_PROCESS_GROUP`、後者は`CREATE_NEW_PROCESS_GROUP`のみを使用します。

## 開発用fixtureとテスト

巨大なLarge/R4 modelは実行しません。`tests/test_runner.py` は一時ディレクトリ内のfake CLIで既存Runner契約と fail-closed 条件を確認します。`sample/clean_mesh_box/` は小さな診断 STL 用の実ジョブ例です。

```text
python -m unittest discover -s tests -v
```

`sample/clean_mesh_box/SLICE_JOB.json` は Issue #30 で実機slice PASSした小さなSTL routeを再現する job です。engine pathはこの作業機のBambu Studio installationを参照します。`sample/D22_2_SLICE_JOB/SLICE_JOB.json` は旧schemaの構造確認用です。

## Known limitations / FOLLOW-UP

- この環境のBambu Studio 02.08.02.61 は `--help` でstdout/stderrにhelp textを返しませんでした。sample jobでは、既存の成功済みA1 single-filament executionで受理されたargvを使用しています。別engine versionや別CLI optionは未検証です。
- このinput validatorはASCII/binary STLとmm unitsだけを扱います。mesh transformはjobとmanifestに意図として記録しますがRunner自身では適用せず、mesh bytesを変更しません。
- `native_bambu_project` のprovenanceは宣言を検証するだけです。3MF内部構造を解析したり、自己申告が事実かどうかを証明したりしません。
- CLIが機械可読progressを出さない場合、ETAは2971秒を基準にした推定です。
- local scratchへの自動コピー、full G-code hash、toolpath audit、printer sendはMVP対象外です。
