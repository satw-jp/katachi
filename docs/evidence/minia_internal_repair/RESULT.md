# MINI_A — Authorレビュー用V2

STOP: `MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW`。Astra review: pass（review round2、fix cycle1）。物理強度・Author GUI受入れをPASSにした意味ではない。

開くものは `MINIA_ROUTE_EDITOR_START.lnk`。対象ファイルは `MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend`、短い操作手順は `AUTHOR_GUIDE.md`。`.blend`単体では静的表示のみ。基本V1は固定したまま残している。

初回はF3457 DEMO、モデル高さ43.2 mm、Support込み。実破損位置は未特定。18実mesh内でモデル基部まで二本の幾何経路を確認したが、受け接触の仮定を含み、実raft接続・強度は未確認。除去後の入力graph0は実物の0を意味しない。

45 mmでは入力graph上でSupport込み3以上、除去後1。除去後の共通枝はA3457 / C0016 / G0181 / R0001。A3457を解析上で除くと、F3457一花とR5_F3457_P1〜P6の六枝が基部接続を失う。影響bboxはplate座標で約(27.76,104.10,42.02)〜(30.92,107.24,45.00) mm。これは落下・破断予測ではない。

TEST_ONLYの局所線は、45 mmでは1→1のまま共通枝をC0016/R0001へ減らした。条件付きevent推定では一本目の成立を44.6→43.2 mmへ早めたが、第二経路は156 mmまで未発見。新枝は設計意図だけで、実材化も新G-code確認もしていない。納品V2の追加線は0本。

根拠は、全体の宣言graph＋18meshの実接触/分離片であり、全実材接触を網羅しない。旧G-codeは三つの局所命令/層高のみ照合。model Zとmachine Zの+0.6 mm仮定は分離している。境界を基部にせず、共通joint依存を枝の独立性と別に表示する。

検証は15合成fixture、実領域8ケース、source/contact無効化、編集前後、Object/Edit ModeのSTALE、未出現ID保持、保存/fresh再読込、配布bootstrap、参照改変HOLDを通過。初回再評価約9.5秒、poll約0.18秒。高さ区間比較backend合計19.49秒、総検証92.23秒、peak working set763.1 MB。GUI操作そのものと使いやすさは未検証。

成功package・editable製造原本・V1は最終hash照合で不変。新規slice=0、Send=0、Print=0。Issue37/38、LARGE、MINI_D、MINILのHOLDを解除せず、他laneのCURRENTや既存job/worktreeを変更していない。

Git branch: `agent/minia-internal-repair-editor-v1`。最終HEAD/dirty状態/PRはcommit後に `GITHUB_HANDOFF.json` へ記録する。変更範囲はこのlaneのCURRENT/task、tools/minia_internal_repair、docs/evidence/minia_internal_repairのみ。

次の行動: 起動ショートカットから表示・選択・編集をAuthorが確認し、別名保存した編集版.blendを同じchatへ返す。その後、差分受入れ→新枝だけの実材化→局所geometry確認→別途許可されたslice/package→Author Print GOへ進む。

FOLLOW-UP: 実GUIでの表示コントラスト/操作採否。表示用Curveのbevel/radiusはfingerprint対象外だが、source半径台帳と製造原本は固定。今回追加修正しない。
