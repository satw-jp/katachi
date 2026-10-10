import pathlib,json
R=pathlib.Path(__file__).resolve().parent.parent;O=R/'outputs'
p=O/'SOURCE_BINDING.json';d=json.loads(p.read_text(encoding='utf-8'));d['editor_created']=True;d['basic_editor_artifact']='MINIA_INTERNAL_REPAIR_EDITOR_V1.blend';d['basic_editor_gate']='MINIA_AUTHOR_INTERNAL_REPAIR_EDITOR_READY';p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
p=O/'ROUTE_MODEL_AND_LIMITATIONS.md';s=p.read_text(encoding='utf-8');s=s.replace('状態: **部分実装・実graph/UI統合前**。Source bindingは通過済み。基本Editorを本機能の完成待ちにしない。NetworkX解析moduleの15件の合成fixtureは通過したが、これを実データ解析・STALE表示・Author操作の受入と混同しない。以下の設計契約のうち未実装の部分は引き続き受入条件である。','状態: **基本Editor V1納品済み／実データbackend検証済み／V2 UI統合中**。Source bindingと基本Editorの保存・再読込・差分抽出は通過済み。NetworkX解析moduleの15件の合成fixtureと実データ一領域を検証した。UI/STALE/保存再読込の検証は別に行い、Author GUI操作と実強度は未確認のまま残す。');s=s.replace('model Z 30–48 mm','モデル高さ（変換後のplate Z）0–156 mm');s=s.replace('正式な対象点・部材集合・開始高さはSource binding後のデータ確認で固定する。','初回表示はF3457、モデル高さ43.2 mm、PRINTING_WITH_SUPPORTに固定する。');s+='''
## 実データbackendで確認した結果

モデル高さはsource→plate変換後のZ。平面はZ=hであり、変換のZオフセットをもう一度引かない。旧G-codeのmachine Zとは別である。

F3457は43.2 mmで単一の実材片。Support込みでは、18mesh内の正の重なりとモデル基面までの経路を二本確認した。SupportとPermanentの接触はBEARING_CONTACTという仮定を含み、実際のraft接続や接着強度を証明しない。Support除去後の入力graphでは0だが、未確認接触が残るため、実物に経路が無いとは判定しない。

45.0 mmでは入力graph上でSupport込み3以上、除去後1。除去後の共通枝はA3457 / C0016 / G0181 / R0001。このPermanent経路には宣言接続が残る。すべて実物の確定ルート数としては灰色の未確認表示とする。

安定した単一F3457片となる43.0 mm以降の接続単調性を仮定したevent探索では、除去後の1本目は44.6 mm（直前grid44.4）、2本目は156 mmまで未発見。44.6–156 mmは入力graph上の一本依存区間推定であり、全実材の証明ではない。未計測の偶発接触、宣言親への投影、geometryの限界を含む。時刻は推測しない。

TEST_ONLYの局所追加線R5_F3457_P1 END→G0165 ENDを45 mmで比較すると、除去後1→1、共通枝は4本からC0016/R0001へ減る。局所的に迂回しても基部まで独立した第二経路にならない例であり、作品への提案・採用ではない。

runtimeは保存済みの6.6 MB高さ接触cacheを利用する。スライダー変更で巨大3MFを展開しない。source JSONは起動時にhash確認し、稼働中のsource/contactファイル変更をSTALEとして検出する。外部ファイルを変更して同サイズ・同mtimeへ偽装する操作は想定しない。
''';p.write_text(s,encoding='utf-8')
(O/'RESUME.md').write_text('''# MINI_A — resume checkpoint

2026-10-09 JST。Astra decision owner / 同じLUNA一名による実装。同じchat・同じlaneで継続。

- SOURCE_BINDING: MINIA_SUCCESSFUL_PRINT_SOURCE_BOUND。9,421 Permanent records。3face差は明示remapで解決。元のrepacked製造geometryは固定。
- 基本Editor V1とAUTHOR_EDIT_GUIDE.mdは納品済み。EDITOR_REVIEW.json: pass、MINIA_AUTHOR_INTERNAL_REPAIR_EDITOR_READY。以後V1を変更しない。
- V2追加visualizerはLUNAがwork/luna_visualizerで統合中。親はwork/route_visualizerのbackendと証拠・GitHubを担当。追加agentは禁止。
- backendは全体の宣言graphと選択した18meshの実材分離片を統合。モデル高さ0–156 mm/.2。15合成fixtureと実データ8ケース・TEST_ONLY前後比較を検証。
- 初回F3457 DEMO、43.2 mm、Support込み。実破損位置は未確定。実物の完全接触graphではないので未確認灰色。
- 43.2 mmでSupport込み入力graph2（モデル基部までgeometry接触とbearing仮定）、除去後graph0（実物の0を意味しない）。45 mmでは3以上/1。除去後共通枝A3457/C0016/G0181/R0001。
- 旧G-codeは3局所命令位置/層高のみ再照合。+0.6 mm raft換算、bed-rooted toolpath ancestry未確認。追加線TOOLPATH_UNVERIFIED。
- runtime配布先outputs/route_runtime。ローカルNetworkX ZIP同梱。source JSONは既存のhash固定パスを読む。巨大3MFをsliderで展開しない。
- isolated repo work/katachi-minia-repair、branch agent/minia-internal-repair-editor-v1。最終コード・証拠・CURRENT/taskをcommit/push予定。

残作業: V2 UI/STALE/前後比較/保存fresh reopen/性能検証、Astra review、launcher、最終guide/test/result/current/resume、small GitHub handoff。最終STOPはMINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW。

Source binding / software / geometry範囲 / old G-code範囲 / Blender保存再読込 / Author実操作 / Physical強度を独立して報告する。Author GUIと実強度は未検証。

製造geometry変更・新slice・Send・Printは全て0。GUI Computer Use禁止。Issue37/38や他lane、原本、既存job/worktreeを変更しない。V2 review/fixは原則2周、DoD外はFOLLOW-UP。
''',encoding='utf-8')
backup=O/'MINIA_INTERNAL_REPAIR_EDITOR_V1.blend1'
if backup.exists():backup.rename(R/'work/luna_editor/MINIA_INTERNAL_REPAIR_EDITOR_V1.build-backup.blend1')
print('Checkpoint and limitations updated; V1 backup retained in work.')
