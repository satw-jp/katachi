# MINIL LOWZ50 SECTION READER REPAIR — HOLD

Authority: [Issue #66](https://github.com/satw-jp/katachi/issues/66) / [PR #67 review](https://github.com/satw-jp/katachi/pull/67#pullrequestreview-5623555169).

STOP: **HOLD — UNKNOWN_SOURCE_SECTIONS / GENERATOR_NECK_SECTION_UNVERIFIED**

断面読取をLOWZ専用に修正し、LIGHT全53部材・CAD 0〜50mmと境界確認分を新規計算した。閉輪郭から作った既知占有は独立照合を通過したが、UNKNOWNが残るため `LOWZ50_SECTION_READER_VALIDATED` と生成器READYの全体ゲートは未成立。**新しい実MINIL枝・Candidate・支持改善比較は生成しない。** 旧キャッシュ、旧8本、旧改善値は引き続き使用禁止。

## 原因

旧キャッシュ全53部材のX範囲外記録を原因追跡用に調べ、最初の記録がFLOWERS_00（part 3）のcomponent 189、CAD Z=0.660mmであることを照合した。Y=120.670mmで交点が3個になる。交点Xは152.242786668、152.243477063、154.971156484mm。従来処理は奇数交点の後を格子右端X=255.97mmまで塗った。`OLD_GHOST_ORDER.json` は原因追跡専用であり、旧占有を今回の検証・生成へ再利用していない。

元の14,269三角形群には開放辺218・非多様体辺329。実際にこの断面を横切る異常辺は10本（接続数1または3）で、元三角形番号（`3D/Objects/object_3.model` 内の0-based index）・辺端点と交線端点を保存した。座標一致で頂点を照合しても辺の異常数は変わらない。同一Z頂点は0、最寄り頂点とのZ差は約0.0011444mm。この例の原因は**元メッシュの開放・非多様体部分**であり、共有頂点の別index、水平面との一致、単なる丸め誤差では説明できない。全てのUNKNOWNや実印刷の崩壊原因をこの例から断定しない。

全件監査で、同じcomponent 189の **Z0.22mm** が最初のUNKNOWNと判明した。これは最初のX範囲外誤塗り（Z0.66mm）とは別である。Z0.22mmは端点接続数1が2個・3が2個残り、旧処理の奇数交点ガードを通過して占有を返す。つまり偶数交点や全体bbox内であることだけでも閉鎖性を証明できない。`EARLIEST_UNKNOWN.json` と交線・元三角形番号を別保存した。

## 修正と未解決

- 三角形と水平面の交線→端点グラフ→閉輪郭を構成。穴を偶奇で扱い、開放・分岐・重複・交差輪郭はUNKNOWN。右端クリッピングや穴の推測閉鎖は行わない。
- welding tolerance=1e-8mm。真に0長の点接触と非0の極短線分を区別し、後者はUNKNOWN。断面上の頂点は元座標を保持し、辺ごとの再計算誤差を避ける。水平面上の面は保守的にUNKNOWN。
- 各正常断面の独自scanline占有とGEOS polygon containmentを比較。穴・格子上境界も照合。保存後に部材断面から占有を再構成して一致、各Z断面bbox外の既知占有0。
- UNKNOWNを支持済みや空白として需要分類しない。UNKNOWNが1件でも残るキャッシュは需要抽出・生成前に拒否。未知領域の包絡は可視化用であり、塗りつぶし領域ではない。
- V2の支柱・neck・足・brace寸法、選択規則、共通 `_section_pixels` の既定動作は変更なし。保護コードのSHA一致。手置き座標・特定Flower ID分岐なし。

## 実LIGHTの新規監査

- 入力SHA: `ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415`（読取前後一致）
- 格子XY `0.220000000` mm、Z間隔 `0.146666667` mm、断面位相は半層。保存A1座標系のCAD比較であり、native層・実job・raft位置の証明ではない。
- 全53部材。予定した断面 `444,891` 件を全数分類。
- 正常断面 `422,986` 件。全てGEOS参照一致。
- UNKNOWN `21,905` 件。空白として計数しない。
- 各Z断面の輪郭bboxから数値許容差1e-8mmを越える既知占有 `0` 件。クリッピングで消していない。
- 原本・元Support台帳SHA不変。新規実MINIL候補0、native slice0、Send0、Print0。

UNKNOWN理由:

- `TOUCHING_OR_CROSSING_RINGS`: 1,968
- `DUPLICATE_SEGMENT`: 2,777
- `OPEN_OR_NONMANIFOLD_CONTOUR`: 17,119
- `SUB_TOLERANCE_SEGMENT`: 14
- `INVALID_RING`: 27

| Part | Known section | UNKNOWN |
|---|---:|---:|
| 1 / PERMANENT.stl | 8950 | 5200 |
| 3 / FLOWERS_00.stl | 924 | 6162 |
| 4 / FLOWERS_01.stl | 580 | 3669 |
| 5 / FLOWERS_02.stl | 656 | 3029 |
| 6 / FLOWERS_03.stl | 492 | 1535 |
| 7 / FLOWERS_04.stl | 509 | 1584 |
| 8 / FLOWERS_05.stl | 220 | 714 |
| 301 / TARGET_PLACEMENT_1790_CANDIDATE_28848 | 0 | 0 |
| 302 / TARGET_PLACEMENT_1965_CANDIDATE_4510 | 0 | 0 |
| 305 / TARGET_PLACEMENT_1797_CANDIDATE_34400 | 0 | 0 |
| 306 / TARGET_PLACEMENT_1905_CANDIDATE_75654 | 0 | 0 |
| 307 / TARGET_PLACEMENT_1723_CANDIDATE_52746 | 0 | 0 |
| 308 / TARGET_PLACEMENT_1919_CANDIDATE_97145 | 10 | 0 |
| 311 / TARGET_PLACEMENT_1937_CANDIDATE_951 | 13 | 0 |
| 313 / TARGET_PLACEMENT_1715_CANDIDATE_97003 | 0 | 0 |
| 314 / TARGET_PLACEMENT_1954_CANDIDATE_4114 | 0 | 0 |
| 303 / TARGET_PLACEMENT_2072_CANDIDATE_93334 | 10 | 0 |
| 304 / TARGET_PLACEMENT_2278_CANDIDATE_39539 | 13 | 0 |
| 309 / TARGET_PLACEMENT_2288_CANDIDATE_71468 | 0 | 0 |
| 310 / TARGET_PLACEMENT_2238_CANDIDATE_66873 | 13 | 0 |
| 315 / TARGET_PLACEMENT_2173_CANDIDATE_92654 | 0 | 0 |
| 312 / TARGET_PLACEMENT_0742_CANDIDATE_85445 | 0 | 0 |
| 316 / EXACT_FLOWER_ROW_446 | 43 | 0 |
| 317 / EXACT_FLOWER_ROW_1820 | 0 | 0 |
| 318 / EXACT_FLOWER_ROW_887 | 0 | 0 |
| 900 / LOCAL_CONNECTIONS_3 | 0 | 0 |
| 901 / PERMANENT_BRANCH_ADDITIONS | 753 | 0 |
| 1001 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_00001_MINIL_RS_00500 | 0 | 0 |
| 1002 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_00501_MINIL_RS_01000 | 0 | 0 |
| 1003 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_01001_MINIL_RS_01500 | 76 | 0 |
| 1004 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_01501_MINIL_RS_02000 | 823 | 1 |
| 1005 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_02001_MINIL_RS_02500 | 29609 | 1 |
| 1006 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_02501_MINIL_RS_03000 | 71823 | 2 |
| 1007 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_03001_MINIL_RS_03500 | 48819 | 2 |
| 1008 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_03501_MINIL_RS_04000 | 80081 | 4 |
| 1009 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_04001_MINIL_RS_04500 | 16856 | 1 |
| 1010 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_04501_MINIL_RS_05000 | 16860 | 0 |
| 1011 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_05001_MINIL_RS_05500 | 16988 | 0 |
| 1012 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_05501_MINIL_RS_06000 | 17197 | 0 |
| 1013 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_06001_MINIL_RS_06500 | 17535 | 1 |
| 1014 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_06501_MINIL_RS_07000 | 14859 | 0 |
| 1015 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_07001_MINIL_RS_07500 | 14205 | 0 |
| 1016 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_07501_MINIL_RS_08000 | 14236 | 0 |
| 1017 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_08001_MINIL_RS_08500 | 14811 | 0 |
| 1018 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_08501_MINIL_RS_09000 | 14210 | 0 |
| 1019 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_09001_MINIL_RS_09500 | 14107 | 0 |
| 1020 / REMOVABLE_AUTHORED_SUPPORT_MINIL_RS_09501_MINIL_RS_09701 | 6453 | 0 |
| 2001 / MINIL_RS_09702 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 80 | 0 |
| 2002 / MINIL_RS_09703 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 60 | 0 |
| 2003 / MINIL_RS_09704 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 38 | 0 |
| 2004 / MINIL_RS_09705 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 37 | 0 |
| 2005 / MINIL_RS_09706 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 0 | 0 |
| 2006 / MINIL_RS_09707 REMOVABLE AUTHORED SUPPORT - REVIEW ONLY | 37 | 0 |

各件のpart/component/Z、理由、輪郭bboxまたは保守的包絡は `closed_sections_v3/UNKNOWN_REGIONS.json`。全断面の独立検証は `SECTION_VALIDATION.json`、全入力変換・格子・コードSHAは `SOURCE.json`、保存後hashは `CACHE_SEAL.json`。旧断面キャッシュの再利用ではなく、今回の原本読取から作成した。

実行時のコードは `RUN_ADAPTER.py` / `RUN_SECTION_READER.py` にバイト同一で保存。公開版adapterは実行後に古いモジュール説明文だけを修正しており、説明文以外のAST一致を `ADAPTER_DOC_ONLY_DIFF.json` に記録した。

## 回帰と限界

**59テストPASS**（既存16件を維持、開放・非多様体・共有頂点・穴・同一Z・極薄・独立成分・格子境界・キャッシュ失効、旧V2/MINIL回帰を含む）。

一方、別processの生成再現テストは **HOLD**。合成fixtureのneckでZ4.033333/5.353333mmに1e-8mm以下の交線があり、保守的なUNKNOWNで停止した。これをPASSや実MINIL改善と数えない。近傍頂点Z差は約3.18e-8/1.40e-7mm。旧V2形状は変えていないが、LOWZ側の読取ゲートは従来より厳しく、このnear-planeケースの成立は未解決。`SYNTHETIC_REPLAY_HOLD.json`参照。

初回・2回目の断面計算は追加回帰の修正時に今回の解析processだけを中断し、その出力を保全した。最終v3は新しい空の出力先に全件計算。中断キャッシュを流用していない。修正2周の範囲で停止し、追加の許容値緩和は行わない。

## 次の最小判断

1. 形状を変えない制約では、LIGHTの開放・非多様体断面を閉鎖したと推測できない。実jobに対応する保存G-codeなど、UNKNOWNを解消できる別の検証根拠を扱うかをAuthor判断とする。精密Candidate Cへ無断差替えしない。
2. 生成規則を変えず、near-planeの微小交線を安全に分類する追加の数値検証が必要。実在する薄片を落とさず、候補の読取UNKNOWNを明示して止める挙動を維持する。

現印刷は `AUTHOR_CONTINUES_OBSERVATION`。現在のjobへの接続・停止・設定変更なし。新候補 `print_go=false`。PR65不変、PR67はDraft・未merge。

Branch: `agent/minil-support-lowz50-program-v1`。ローカルHEADは `f5febf59a47d1d90f6a0bcc7c0df43cc43654db4`、dirtyあり。未採用探索コードを保全。公開先commitは `PUBLICATION.json` に記録。
