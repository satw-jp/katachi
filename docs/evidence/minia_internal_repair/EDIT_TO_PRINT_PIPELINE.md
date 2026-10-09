# MINI_A — Author編集から印刷packageまで

2026-10-09 JST / decision owner: Astra、外観・Print GO・実印刷: Author。

## 現在のgate

Source bindingは `MINIA_SUCCESSFUL_PRINT_SOURCE_BOUND` を通過し、基本Editor V1の保存・再読込・追加線の差分抽出まで検証済み。追加visualizerの受入状況は `RESULT.md` / `TEST_RESULTS.json` を参照する。以下は本laneの後続処理契約であり、追加枝の実材化・slice・完成packageの検証済み実装を意味しない。初回はAuthorが実際に編集した1領域から進める。

## 不変の製造baseline

- 編集用原本: `J:\My Drive\codex\2026-09-22\skin-fukei-slice-runner-execution-3\outputs\MINIA_PLA_EDITABLE_REPACKED.3mf`
- SHA-256: `2fd6d48034e46c2e9e0200fd3ed145159d825035df3892bc1f61ac4e2d4f9736`。
- 成功製造基準は `J:\My Drive\codex\2026-09-23\files-pasted-by-the-user-fukei\outputs\R4_MINIA_TERMINAL_REVIEW_20260922\package_only\plate_1.gcode.3mf` の展開G-code、SHA-256 `b90c9037bf38a63ac852d77e7326c5cc99b605f0091cca19b1b68ba7dd561ad9`。
- Source: `R4_A_F2_PRINT_PREPARATION/A/data/structure.json`、`R4_A_MINI_LOCAL_LOBE_R1/data/ADDED.json`、`R4_ROOT_LAUNCH_R5/data/FROZEN_ADDITIONS.json`。全て `J:\My Drive\codex\2026-09-10\r4-astra-mocomoco-j-my-drive\outputs` 配下。
- ArtworkとSupportをsourceから全再生成しない。成功版native geometryを固定して新枝のみ追加する。表示proxyを製造工程へ渡さない。
- source worldからplateへの式は `p_plate = p_source × 0.7333333333333333 + (89.58849309285482, 91.38825149536133, 1.2951087678814617)`。実native component/buildの連鎖と一致するroute記録値。既にplate座標のEditorへ倍率を再適用しない。
- `TRANSFORM_AND_REFERENCE_LOCKS.json` で実editable metadataの連鎖と上式を照合済み（translation差 `4.27e-14 mm` 未満）。同ファイルにFlower、assignment、Support、追加ID mapの実hashを保存。
- 実editableの保存条件はA1 mini / 0.4 mm nozzle / PLA / 0.2 mm layer・initial layer / nozzle 240°C / Textured PEI 65°C / raft2 / 100% aligned rectilinear / retraction0 / automatic Support OFF。これは保存設定であり、全実押出命令や実機telemetryの再監査を意味しない。

## Authorが編集ファイルを返した後

1. **差分抽出（LUNA）** — 保存済みbaselineのID、点、半径、親子関係、オブジェクト変換と比較する。既存頂点の移動・欠損、既存枝の移動・削除、参照改変はHOLD。新枝に一意なIDを発行し、端点・中心線・接続先・新分岐点・コメントを保存。追加以外の編集を自動で修正して隠さない。
2. **局所設計（Astra）** — 最初の1領域について、接続意図、造形方向、径、接合長、blend、Support除去空間を元の部材設定に基づき固定する。本数は領域ごとに判断。長い中央横断、全枝増径、花・外殻・Support変更をしない。
3. **実材化（LUNA）** — 既存member生成規則とNPZ出力を再利用して新枝だけを円断面mesh化。Editorのplate座標は上記変換の逆変換でsource worldへ戻す。成功版で使われたrepack方式を参考に、既存Part1へ追加meshだけを組み込み、Part3 authored Supportと既存2-part構成・component/build transformを保持する別versionのeditable 3MFを作る。新枝のnative局所座標を実transformの逆変換から算出し、plateで再検算する。元の頂点・三角形・index対応を保持し、新枝の中心線からmeshまでのID対応と追加rangeを保存する。このpatch実装はAuthorの初回編集を受領した後の作業であり、まだ実証済みとはしない。
4. **Geometry gate（Astra）** — Flower、外殻、既存Permanent、Support、配置・倍率が不変。差分が新枝のみ。狙った接合は正の体積で検証し、線交差/AABB/近接だけをPASSにしない。孤立、意図しないFlower/Support融合、build volume逸脱を確認する。
5. **最小slice準備（LUNA/Astra）** — 成功したPLA runの入力・resolved settingsから機種、ノズル、積層、温度、冷却、raft、retraction、Supportを明示して凍結する。別laneの0.2mm PETG設定を混ぜない。`SLICE_JOB.json`、入力hash、独立version/run directoryを記録する。Runner/Console自体を改造しない。
6. **実行と実経路監査** — このEditor準備段階ではsliceしない。Author編集受入れ後の実行時には、既存Runnerの運用契約とその時点のAuthor指示に従う。manifestのstatusだけで完成と判定せず、実出力と入力同一性を確認。新枝初出層、下層との連続、接合の押出経路、floating増加、経路消失、除去経路、明白なノズル衝突懸念を局所監査する。
7. **Package（LUNA）** — 完成G-codeから既存package-only/DEFLATE処理を再利用。展開G-codeのbytes/SHA、ZIP CRC、機種・PLA使用量・設定・plate情報を検証し、新versionへ保存する。原本は置換しない。
8. **Decision-owner review（Astra）** — Bambu StudioでPreviewとSend dialogの表示を確認し、`MINIA_INTERNAL_REPAIR_PRINT_PACKAGE_READY`。実Send/Printは実行しない。
9. **Author Print GOと物理試験** — Authorが外観採否とPrint GOを判断し、Send/Printする。除去後の破損と光の抜け等の実結果を次の同じlaneに記録する。software geometry PASSとphysical strength PASSを分離する。

## 継続方法

各回を `REPAIR_R001`、`REPAIR_R002`…で識別し、入力blend/hash、baseline、差分、判断、製造version、物理結果を保存する。受入れ前の複数編集は勝手に累積しない。初回1領域の往復実証後、同じ方法を残りへ再利用する。写真指定も受け付け、画像領域と3Dの確度を分ける。

Issue #37/#38、LARGE、MINI_D、MINIL、既存worktree、稼働jobは変更対象外。
