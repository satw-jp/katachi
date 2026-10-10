import pathlib,json,hashlib,shutil
R=pathlib.Path(__file__).resolve().parent.parent;O=R/'outputs';repo=R/'work/katachi-minia-repair'
def read(name):return json.loads((O/name).read_text(encoding='utf-8'))
def write(name,data):(O/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
v=read('MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_TEST_RESULTS.json');fresh=read('MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_FRESH_REOPEN.json');launch=read('LAUNCHER_CHECK.json')
required=['height_marks_stale','height_reset_current','mode_marks_stale','A3457_selected_token_stable_at30','A3457_selected_token_stable_at43_2','edit_marks_stale','edit_overlay_hidden','edit_mode_poll_stale','edit_mode_overlay_hidden','edit_mode_hold']
assert all(v[k] is True for k in required)
assert v['initial_edit_count']==0 and v['author_v2_edit_count']==0 and v['A3457_height30_present'] is False
assert fresh['status']=='CURRENT' and fresh['fresh_open_edge_count']==2
assert launch['pass'] and read('V2_REFERENCE_GUARD_CHECK.json')['pass']
assert read('SOURCE_BINDING.json')['gate_pass'] and read('ROUTE_ENGINE_TEST_RESULTS.json')['pass'] and read('PRESERVED_INPUTS_FINAL_CHECK.json')['pass']
gate='MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW'
guide=O/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_AUTHOR_GUIDE.md';s=guide.read_text(encoding='utf-8')
s=s.replace('「高さ区間を比較」は全高さ域を明示走査します。','「高さ区間を比較」は、安定した単一のF3457片となる43.0 mm以降について、接続が単調に増えるという仮定の下で成立高さを探索します。全781高さを総当たりした結果ではありません。')
s=s.replace('編集用アンカーで2点を選び、Shiftを押しながら選択を足して `F` を押すと、Author用の別meshにedgeを追加できます。', '''初期状態で選択されている編集用アンカーを使います。まず操作練習としてP1/P2付近を確認できます。これは補強の推奨位置ではありません。

1. 編集用アンカーを選択し、`Tab` で編集モードへ入ります。点選択にし、`Alt+A` で選択を解除します。
2. 一つ目の点をクリックし、`Shift` を押しながら二つ目をクリックして、`F` で一本つなぎます。既存点を動かしたり削除したりしません。
3. `Tab` でオブジェクトモードへ戻り、Nパネルの「MINI_A 保持ルート」から「再評価」を押します。編集前／後と残る共通枝を比較します。
4. 必要な場合だけ「高さ区間を比較」を押します。第二経路が増えたか、一本依存区間が変わったかを確認します。
5. 「ファイル → 名前を付けて保存」で、例えば `MINIA_INTERNAL_REPAIR_EDIT_001.blend` として保存します。配布元V1/V2へ上書きしません。

アンカーが選択されていなければ、Outlinerの `AUTHOR_EDIT • DEMO local anchors • select 2 then F` 内の編集用オブジェクトを選びます。全体を編集する場合の参照表示・アンカー切替は `AUTHOR_EDIT_GUIDE.md` を参照してください。

Author用の別meshにedgeを追加する操作です。''')
s=s.replace('保存後に別名blendを開いて動的パネルを使う場合も、起動ショートカットから開いてください。','次回は起動ショートカットを開いてパネルを登録してから、「ファイル → 開く」で保存した編集版を開き、「再評価」を押します。ショートカット自体は配布元V2を開くため、この手順で編集版へ切り替えます。')
s=s.replace('表示値を製造変更や安全判定に使わないでください。','表示だけで製造geometryや物理強度をPASSにしません。編集版の差分受入れ後に、追加枝の実材化・局所geometry確認・別途許可されたslice/packageへ進みます。')
s+='\n通常の初回再評価は配布版のfresh起動検査で約9.5秒、編集検知の一回のpollは約0.18秒でした。検知は最大約0.75秒間隔です。PC負荷により変動します。\n'
guide.write_text(s,encoding='utf-8');shutil.copy2(guide,O/'AUTHOR_GUIDE.md')
worker=read('MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_RESULT.json');worker['hashes'][guide.name]=sha(guide);worker['guide_editorial_update']='Astra added explicit Edit Mode/Save As/reopen steps and clarified conditional event-search scope; no runtime or blend change.';write('MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_RESULT.json',worker)
review={'decision':'pass','gate':gate,'reviewer':'Astra','review_round':2,'fix_cycles_used':1,
        'resolved_round_1_findings':['Panel draw is read-only; safe polling/handlers invalidate state','Production object/Edit Mode poll invalidates data and hides overlay','Stable physical failure IDs and explicit absent-at-height status'],
        'additional_verification':['Delivered bootstrap in fresh background Blender','Protected reference mutation causes HOLD without saving candidate','Rendered preview inspected; display reference/bbox/schematic distinctions retained'],
        'v2_sha256':sha(O/'MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend'),'author_added_edges':0,
        'scope':'Seven bounded DoD items fulfilled for Author review; no GUI usability or physical acceptance claimed.',
        'author_gui':'UNVERIFIED','physical_strength':'UNVERIFIED',
        'follow_up_recommendations':['Author should assess viewport legibility and workflow in actual GUI; rendered gray boxes/witness lines have modest contrast against full-height editing references.','Display-only curve bevel/radius parameters are not fingerprinted; source ledger radii and manufacturing baseline remain locked.']}
write('DECISION_OWNER_REVIEW.json',review)
tests={'state':gate,'decision':'pass_for_author_review','source_binding':{'status':'PASS','evidence':'SOURCE_BINDING.json'},
       'basic_editor':{'status':'PASS','evidence':'EDITOR_REVIEW.json'},'synthetic_graph':read('ROUTE_ENGINE_TEST_RESULTS.json'),
       'real_region':{'status':'PASS_WITH_EXPLICIT_MIXED_GRAPH_SCOPE','cases':8,'evidence':'REAL_GRAPH_VALIDATION.json'},
       'source_contact_invalidation':read('ROUTE_RUNTIME_LOCK_TEST.json'),
       'height_comparison':{'status':'PASS_CONDITIONAL_EVENT_ESTIMATE','evidence':['HEIGHT_EVENT_COMPARISON_TEST.json','MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_HEIGHT_EVENT_EVIDENCE.json']},
       'blender_v2':{'status':'PASS_HEADLESS_DATA_OPERATOR_CHECKS','evidence':['MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_TEST_RESULTS.json','MINIA_LAYERWISE_ROUTE_VISUALIZER_V2_FRESH_REOPEN.json','LAUNCHER_CHECK.json','V2_REFERENCE_GUARD_CHECK.json']},
       'geometry':{'status':'VERIFIED_SELECTED_SCOPE_ONLY','measured_meshes':18,'height_snapshots':781,'range_mm':[0,156],'not_claimed':'Complete incidental contacts, real raft/bed toolpath ancestry or strength'},
       'old_gcode':{'status':'THREE_LOCAL_EVENT_COMMANDS_CHECKED_ONLY','evidence':'GCODE_SELECTED_EVENT_CHECK.json','new_branches':'TOOLPATH_UNVERIFIED'},
       'performance':{'v2_test_wall_s':v['full_validation_wall_s'],'peak_working_set_mb':v['memory']['peak_working_set_mb'],'initial_evaluation_s':launch['evaluation_seconds'],'poll_s':launch['poll_seconds'],'height_event_backend_sum_s':19.490931600001204,'isolated_height_button_wall_s':'NOT_MEASURED'},
       'preserved_inputs':'PRESERVED_INPUTS_FINAL_CHECK.json','author_gui':'UNVERIFIED','author_usability_acceptance':'UNVERIFIED','physical_strength':'UNVERIFIED',
       'new_slice_count':0,'send_count':0,'print_count':0,'manufacturing_geometry_changed':False,'review':'DECISION_OWNER_REVIEW.json'}
write('TEST_RESULTS.json',tests)
analysis=read('ROUTE_ANALYSIS.json');analysis['state']=gate;analysis['author_editor']='MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend';analysis['runtime_current_evaluation']='Recomputed by the delivered bootstrap/panel; static report is baseline only.';analysis['test_only_comparison']='HEIGHT_EVENT_COMPARISON_TEST.json';analysis['analysis_version']='MINIA_ROUTE_V1';analysis['source_baseline_sha256']=read('SOURCE_BINDING.json')['editable_candidate']['container_sha256'];analysis['edit_delta_sha256']=hashlib.sha256(b'[]').hexdigest();analysis['base_ids']=['MODEL_BASE'];analysis['permanent_base_member_ids']=['R0000','R0001'];write('ROUTE_ANALYSIS.json',analysis)
p=O/'ROUTE_MODEL_AND_LIMITATIONS.md';s=p.read_text(encoding='utf-8');start=s.index('状態:');end=s.index('\n\n',start);s=s[:start]+'状態: **'+gate+'**。基本Editor V1は先行納品済み。V2のheadless data/operator検査、保存・fresh再読込、Astra reviewを通過した。Author GUI操作・使いやすさと実強度は未確認。個別の根拠はTEST_RESULTS.json / DECISION_OWNER_REVIEW.json。'+s[end:];p.write_text(s,encoding='utf-8')
result=f'''# MINI_A — Authorレビュー用V2

STOP: `{gate}`。Astra review: pass（review round2、fix cycle1）。物理強度・Author GUI受入れをPASSにした意味ではない。

開くものは `MINIA_ROUTE_EDITOR_START.lnk`。対象ファイルは `MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend`、短い操作手順は `AUTHOR_GUIDE.md`。`.blend`単体では静的表示のみ。基本V1は固定したまま残している。

初回はF3457 DEMO、モデル高さ43.2 mm、Support込み。実破損位置は未特定。18実mesh内でモデル基部まで二本の幾何経路を確認したが、受け接触の仮定を含み、実raft接続・強度は未確認。除去後の入力graph0は実物の0を意味しない。

45 mmでは入力graph上でSupport込み3以上、除去後1。除去後の共通枝はA3457 / C0016 / G0181 / R0001。A3457を解析上で除くと、F3457一花とR5_F3457_P1〜P6の六枝が基部接続を失う。影響bboxはplate座標で約(27.76,104.10,42.02)〜(30.92,107.24,45.00) mm。これは落下・破断予測ではない。

TEST_ONLYの局所線は、45 mmでは1→1のまま共通枝をC0016/R0001へ減らした。条件付きevent推定では一本目の成立を44.6→43.2 mmへ早めたが、第二経路は156 mmまで未発見。新枝は設計意図だけで、実材化も新G-code確認もしていない。納品V2の追加線は0本。

根拠は、全体の宣言graph＋18meshの実接触/分離片であり、全実材接触を網羅しない。旧G-codeは三つの局所命令/層高のみ照合。model Zとmachine Zの+0.6 mm仮定は分離している。境界を基部にせず、共通joint依存を枝の独立性と別に表示する。

検証は15合成fixture、実領域8ケース、source/contact無効化、編集前後、Object/Edit ModeのSTALE、未出現ID保持、保存/fresh再読込、配布bootstrap、参照改変HOLDを通過。初回再評価約{launch['evaluation_seconds']:.1f}秒、poll約{launch['poll_seconds']:.2f}秒。高さ区間比較backend合計19.49秒、総検証92.23秒、peak working set763.1 MB。GUI操作そのものと使いやすさは未検証。

成功package・editable製造原本・V1は最終hash照合で不変。新規slice=0、Send=0、Print=0。Issue37/38、LARGE、MINI_D、MINILのHOLDを解除せず、他laneのCURRENTや既存job/worktreeを変更していない。

Git branch: `agent/minia-internal-repair-editor-v1`。最終HEAD/dirty状態/PRはcommit後に `GITHUB_HANDOFF.json` へ記録する。変更範囲はこのlaneのCURRENT/task、tools/minia_internal_repair、docs/evidence/minia_internal_repairのみ。

次の行動: 起動ショートカットから表示・選択・編集をAuthorが確認し、別名保存した編集版.blendを同じchatへ返す。その後、差分受入れ→新枝だけの実材化→局所geometry確認→別途許可されたslice/package→Author Print GOへ進む。

FOLLOW-UP: 実GUIでの表示コントラスト/操作採否。表示用Curveのbevel/radiusはfingerprint対象外だが、source半径台帳と製造原本は固定。今回追加修正しない。
'''
(O/'RESULT.md').write_text(result,encoding='utf-8')
checkpoint=f'''# MINI_A CURRENT / RESUME

STOP: {gate}

Astra review pass、LUNA bounded implementation完了。基本V1は先行納品済み・固定。V2はAuthor GUIレビュー待ち。自動的に実材化/slice/Send/Printへ進まない。

起動: MINIA_ROUTE_EDITOR_START.lnk。ファイル: MINIA_LAYERWISE_ROUTE_VISUALIZER_V2.blend。ガイド: AUTHOR_GUIDE.md。初回F3457 DEMO / plate Z43.2 mm / Support込み。納品追加線0。

最終判断はRESULT.md、個別試験はTEST_RESULTS.json、sourceはSOURCE_BINDING.json、routeの限界はROUTE_MODEL_AND_LIMITATIONS.md。review round2 / fix cycle1。Author GUIと実強度は未確認。

原本/製造geometry/既存G-code不変、新slice0/Send0/Print0。他laneやjob/worktreeを変更しない。次はAuthorが別名保存した編集版の差分受入れ。継続工程はEDIT_TO_PRINT_PIPELINE.md。

Git branch agent/minia-internal-repair-editor-v1。最終HEAD/dirty/PRはGITHUB_HANDOFF.json。再開時はこのcheckpointと同laneのGitHub CURRENTから読み、完了したscanを再実行しない。
'''
for name in ['CURRENT.md','RESUME.md']:(O/name).write_text(checkpoint,encoding='utf-8')
p=repo/'docs/status/MINIA_INTERNAL_REPAIR_CURRENT.md';s=p.read_text(encoding='utf-8');s=s.replace('V2 route UI integration and acceptance are in progress.','V2 is now `'+gate+'` after Astra review round2 / one fix cycle. Author GUI and physical acceptance remain unverified.');s=s.replace('Next: finish V2 UI/STALE/save-reload review and measured runtime, then stop at','V2 UI/STALE/save-reload checks, fresh delivered bootstrap and measured runtime passed; stop at');s+='\nFinal handoff: [RESULT](../evidence/minia_internal_repair/RESULT.md), [TEST_RESULTS](../evidence/minia_internal_repair/TEST_RESULTS.json), [Astra review](../evidence/minia_internal_repair/DECISION_OWNER_REVIEW.json). Next action is Author GUI review and a saved edit, not materialization or printing.\n';p.write_text(s,encoding='utf-8')
for p in O.glob('*.blend1'):
    p.rename(R/'work/luna_visualizer'/('final-backup-'+p.name))
print(gate)
