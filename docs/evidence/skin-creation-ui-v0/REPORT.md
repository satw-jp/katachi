# SKIN Creation UI v0 — Author operation evidence

2026-09-30 / PASS / SKIN CREATION UI V0 — AUTHOR OPERATION REVIEW READY

## Authorが使う入口

http://127.0.0.1:5188/skin-rebuild.html?mode=creation

起動中。再起動する場合はこのworktreeで `powershell -File tools/skin_creation/launch.ps1`。5188/5189が使用中なら既存環境を止めずに終了する。現在のサーバーはこのtask専用で、既存の5186環境とは独立。

1. 花倍率と枝径を選び「花・内部枝を生成」。初回の実生成には数分かかる。
2. 候補カードの「この候補と左右比較」。左右は同一視点・同一実寸。花を非表示にすると内部枝を確認できる。
3. Undo/Redoで現在の生成結果を戻す。「同じ設定で再生成」は元入力から計算し直す。
4. 「この造形で進める」は左側の現在結果を選択する。右側は比較対象。選択は造形上の選択だけで、Print GOではない。
5. 「保存 .skincreation」「保存を開く」で続ける。通常操作にAI、手動JSON編集、Blenderは不要。

納品データ: `author-project.skincreation`。最終の比較状態・6候補・現在の履歴3状態を保存し、別の新しいブラウザセッションで実際に開き直した。Undo後の再生成では通常のUndo方式に従ってRedo分岐を切り替えるが、生成済み候補は比較用に保持する。別途、未適用Redoを含む5状態の保存・復元・Redoも検証済み。

## 実生成結果

mini MOCOMOCO固定、D6固定。Host縮尺11/15と花の物理倍率q×gは独立。

| 花倍率g | 枝径mm | 花数 | 内部部材数 | 生成処理秒 |
|---|---:|---:|---:|---:|
| 1 | 2.2 | 2,303 | 2,885 | 339.05 |
| 1 | 2.4 | 2,303 | 2,885 | 167.57 |
| 11/15 | 2.2 | 4,283 | 4,107 | 533.61 |
| 11/15 | 2.4 | 4,283 | 4,107 | 253.97 |

秒数は生成処理のみで、ブラウザ読込・描画時間は含まない。径だけの変更では両倍率ともsurfaceHash / centerlineHashが一致し、meshHashだけが変化した。2.2mm不変baselineの中心線と先端径比から再メッシュ化し、直前の2.4mmメッシュを累積変形しない。

g=1 / 2.2のsurfaceHash `e48b2a1ca56d30e6d91a1f3bc14807e279b72be53b3501c6b1806926061df723`、structure hash `ed07e2e20226accbaf920e41e568ab74d9d3159c9ae32a53a5bde368c44014a4` は既存受入結果と一致。g=11/15のsurfaceHashは `9740af3ddb8b5e5a7ea27f9cf3ecec17b23803ec321b6d55a922329e2d8bc2b8`。他の完全な識別値は `browser-result.json` / `final-restore-result.json` に保存。

保存→別フォルダへコピー/改名→新project＋新Chrome context→再読込→全再生成:

- g=11/15 / 2.4: 784.32秒、surface / centerline / meshの全識別値が一致。
- g=1 / 2.4: 最終コードで480.82秒、全識別値が一致。
- 最後に納品ファイルを保存し直し、さらに新project・新Chrome contextで開き直した。結果・履歴cursor・比較・選択が保存直前と一致。
- 破損した保存の読込をUIから実行し、400で拒否。現在のproject、履歴、表示結果は保持。
- 実座標の視点ドラッグ、花/Hostの表示切替、内部枝表示も実行。両ブラウザ試験ともpage errors 0。

## 保存容量と移動可能性

- 納品ファイル: **114,117,140 bytes / 約108.83 MiB**。
- SHA-256: `654535f9bc4422bebfe965cf5fa936ca7b67568696ee685a650cf17c91bba0d9`。
- 論理74ファイル、312,117,464 bytes。内容同一のデータを共有して164,793,060 bytesの一意payloadとし、ZIP圧縮。ZIP内はmanifest＋47 blobs。
- 論理内訳: 元入力17,367,484 / layout175,719,004 / result118,874,531 / code151,068 / project履歴等5,009 bytes（runtime記録を別途同梱）。
- 元Host、D6、元構造、Host domain、corridor、サイズ分布、設定、seed、生成コード、生成結果、履歴・比較・選択を同梱。ブラウザ表示用の巨大JSONは保存しない。
- 同じ結果を再生成した履歴でも同一payloadを再格納しない。容量制限は圧縮512 MiB / 論理展開2 GiB。超過時は履歴を黙って捨てず保存を拒否する。
- 復元前に在庫・hash・source identity・code identity・依存版・履歴参照・メッシュ実体・member対応/hash・配置と表示データの一致を検証する。archive内コードを実行しない。
- 保存内の実行参照は相対パス。元runや旧worktreeの場所は不要。原本のバイトを守るため、その中の歴史的な絶対パス文字列は残すが、再生成の読込先には使わない。

Python 3.12.14、numpy 2.5.2、scipy 1.18.1、trimesh 5.1.0、manifold3d 3.5.2で実証。同じ生成コードと依存版のインストールは必要で、実行環境そのものを保存に同梱する方式ではない。同一PCの別フォルダ・新project・新ブラウザで検証済み。別PCでの実行は未検証。

114MBの保存データはGitHub通常pushの100 MiBファイル制限を超えるためcommit対象外とし、このevidenceフォルダに実物を保管する。SHA-256でcommitされた記録と対応づける。初回テストの旧保存方式ファイルは納品せず、`outputs/creation-pre-final-save/` に回復可能な作業記録として保管した。

## 実装・テストの対応

- branch: `agent/skin-creation-ui-v0`
- base: `b4db32bd7442f2a0edb4df6a9ef2a438d17e2f07`
- 実装: `903c12cdad59450f5224a34ea097bd8e6a7debf7`
- 最終runtime: **`7a9ee03e220976aa3fc473ad51a7bcb15020960b`**。以後の変更は証拠・テスト手順・文書・生成物除外のみ。
- `01`〜`07`画像と `browser-result.json`: 4条件、比較、Undo/Redo、小さい花のfresh再生成。Vite起動がcommit前のためfooterはbaseを表示するが、実行した生成・描画コードは最終runtimeと同一。ここで使った中間保存方式は納品方式ではない。
- `08`〜`11`画像と `final-restore-result.json`: **最終runtimeでPython/Viteを再起動して実行**。最終保存方式、復元拒否、Redo、内部枝、視点操作、大きい花のfresh再生成、納品ファイル自体のfresh reopenを検証。footerも最終runtimeを表示。
- 通常ブラウザ操作helperがWindows ACL初期化エラーになったため、既存プロファイルへ接続しない独立した実Chromeの自動テストを使用。生成・編集・保存はUI操作、APIの直接呼出しは状態確認のみ。

主な変更: `src/studies/skin/creation/`、既存entryのcreation分岐、`tools/skin_creation/` の実生成接続・保存・テスト・固定入力、`vite.creation.config.ts`、task/CURRENT/evidence、byte保存用gitattributes。既存Research/Compositionのschema/validatorは変更していない。

生成元: #33のsurface replay（source HEAD `8acbd0e1b1b4db4afa103fc2c042d31f69516b4b`）と#36のinternal geometry（source HEAD `4597c6f2d890fc891a527f8942ac455f31f03f51`）。元worktreeは編集せずコピー先で接続した。同一Hostのcore106部材だけを明示的に再利用し、花依存部材を再生成。#35 Large専用radial-cap処理をminiの拡径に流用していない。

実行した回帰:

- `npm run build`: TypeScript＋Vite PASS。
- `npm run test:skin-authoring`: 5/5 PASS。
- `npm run test:skin-composition`: 8/8 PASS。
- `python -m unittest test_creation -v`（tools/skin_creation内）: 7/7 PASS。
- `browser_test.mjs`: PASS。
- `final_restore_test.mjs`: PASS。
- 限定reviewは2周。欠落メッシュの復元前検証を補い、再reviewはpass。
- 原本CRLFを維持する差分は `core.whitespace=cr-at-eol` で検査。生成コードと元入力のGit blob / 実行ファイルのbyte一致も確認。

生成adapter SHA-256: `754dded5ab087aa6923f5fa78bd15699292f39575fd5928d921e8d101787a72d`。
internal geometry SHA-256: `acce8531d2b22c3e7e185587c44f7d97622c2d8fa98add57a57d1130c728364c`。

## 制限・境界

- このv0はmini MOCOMOCO＋D6、花倍率2条件、枝径2条件のみ。カスタムHost/花・任意数値には未対応。
- 全数・元メッシュを表示するためGPU負荷が高い。生成は分単位であり、リアルタイム変形ではない。視点・表示ON/OFFはセッション内のみ。
- 拡径後の宣言済み接続は実メッシュで検証したが、全ての非対象干渉・chronology・強度・印刷成立を保証するものではない。
- 「選択済み」はテストで行った造形選択の記録であり、Authorによる作品採用を意味しない。
- Support NOT_GENERATED / fabrication NOT_TESTED / Print GO false。Support、slice、STL/3MF/G-code、printer send、印刷は実行していない。
- 採用済み原本・他worktree・他jobへ書込/停止なし。main merge、force push、通常push、deployも行っていない。

FOLLOW-UP（今回実装しない）: カスタム入力の接続、より軽い表示/生成、印刷Supportはそれぞれ別task・別判断。

SKIN CREATION UI V0 — AUTHOR OPERATION REVIEW READY
