# MINIL LIGHT G-code P2 — root cause and scalability

**LIGHT_GCODE_DIAGNOSTIC_P2_HOLD** / AUTHOR REVIEW待ち / `print_go=false`

## 固定DoDと到達点
1. 4,212行の独立支持面積検証：完了。
2. 45,071行の線幅仕様検証：該当Bambuバージョンに限定して完了。
3. UNKNOWN追跡高速化と完全な同等性：性能専用版で5k・10k・50k完了。
4. 統合版の段階実行：下表。停止後は上位段階へ進めていない。
5. コード・証拠の隔離保存：本フォルダ。Drive/GitHub読戻しはPUBLICATION_READBACK.jsonを参照。

## 4,212行：独立判定
Layer2 / machine Z0.50 / Support interface / 幅0.42mm。P1の上下限[0.4111570510,1.0]は分割回数上限ではなく、多数の境界矩形の未確定面積が合算されたため広い。実測：2,409ノード、exhausted=false、内部下限面積3.912993479mm²、上限14.176582932mm²、対象面積9.517028759mm²。各末端矩形の停止面積0.019034058mm²は合計の誤差上限ではない。

別方式で、円形押出領域を内接・外接多角形で挟み、GEOSによる和集合・交差を計算。q=32/64/128で検証し、q128の被覆範囲は約[0.98457324,0.98461097]。0.65を明確に超える。P2ではID条件なしの任意経路に適用できる独立refinementを明示的なopt-inとして追加。旧閾値0.65/0.98、旧面積誤差条件・ノード予算は不変。旧ノード予算到達時はUNKNOWNを維持する。

内外包含は多角形構成の幾何根拠を持つが、GEOSは倍精度。浮動小数点面積の保守側guard=1e-7×max(1,対象面積)を差し引き／加算する。任意精度の形式証明とは称さない。複数解像度、解析解のあるcapsule fixtureでも照合済み。

後続を一括で支持済みに置換していない。各押出を時間順に再解析した5k統合版は3,236経路がscreen-supportedとなり、P1のUNKNOWN576経路が変化した。このprefixはLayer2までであり、作品全体・実印刷成功を示さない。ラフト空隙の物理成立も未認証。

## 線幅仕様
保存ヘッダはBambuStudio 02.08.02.61。同タグの生成コードGCode.cpp:7390/7396はFEATUREとLINE_WIDTHを独立に出力し、幅が変化しない場合はFEATUREが変わっても幅コメントを省略する。native読取側GCodeProcessor.cpp:3309/3424/6108もrole変更ではforced widthをリセットしない。

したがって、この認証済みヘッダ（先頭16行以内）だけにmodal width契約を適用。45,029の0.41999mmは45,068のFEATUREをまたいで45,071に有効、45,139で0.54704mmへ更新。45,396の幅0.48352mmもparserで確認。12種類の実FEATURE遷移を保存し、200kのparser-only比較で360正押出の幅が確定する。これは幾何解析200k完走ではない。

未知の生成元・他バージョンでは従来のリセットを維持。幅未設定・ゼロ幅を古い幅で埋めない。G2の円弧誤差契約と線幅の意味は別問題。統合幾何解析が45,396へ到達していなければ、線幅確認だけでG2をSUPPORTEDとは報告しない。

参照URL：
- https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/GCode.cpp#L7390-L7400
- https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/GCode/GCodeProcessor.cpp#L3309-L3317
- https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/GCode/GCodeProcessor.cpp#L3424-L3428

## 性能だけの変更と意味変更を分離
P1再実行50k：178.889秒、UNKNOWN追跡87.655秒。性能専用版：108.574秒、追跡19.618秒。P1は14,087,257候補、3,642,188距離計算、464,178交差、1,116,952原因参照を処理していた。原因集合の切捨てではなく、既存AABB／線分距離判定を同順序・同数値契約のNumbaループへ移した。root interning、全原因のunion、時系列commit規則は変更しない。

5k/10k/50kのEVENTS（イベントID・source区間・分類・長さを含む）およびCAUSES（全原因集合へのハッシュ参照を含む）は性能専用版とP1でバイト一致。ROOT_SETSに原因集合全体があり、サンプリングや打切りなし。ネストした段階時間は加算しない。詳細はUNKNOWN_TRACKING_PROFILE.json / P1_P2_EQUIVALENCE.json。

## 段階実行
| run | 完了行 | 到達押出Z mm | 秒 | 最大RAM MiB | supported / unsupported / marginal / unknown | 状態 |
|---|---:|---:|---:|---:|---|---|
| p1_10000 | 10000 | 0.7 | 80.345 | 139.40 | 2814 / 0 / 0 / 4655 | COMPLETED |
| p1_5000 | 5000 | 0.5 | 17.837 | 136.57 | 2660 / 0 / 0 / 576 | COMPLETED |
| p1_50000 | 50000 | 0.8 | 178.889 | 154.85 | 2823 / 0 / 0 / 35105 | COMPLETED |
| p2_10000 | 6562 | 部分結果 | 300.007 | 150.43 | — / — / — / — | BUDGET_STOP |
| p2_5000 | 5000 | 0.5 | 73.576 | 148.14 | 3236 / 0 / 0 / 0 | COMPLETED |
| p2_perf_10000 | 10000 | 0.7 | 55.660 | 147.30 | 2814 / 0 / 0 / 4655 | COMPLETED |
| p2_perf_5000 | 5000 | 0.5 | 12.559 | 143.59 | 2660 / 0 / 0 / 576 | COMPLETED |
| p2_perf_50000 | 50000 | 0.8 | 108.574 | 161.67 | 2823 / 0 / 0 / 35105 | COMPLETED |

停止理由：p2_10000：300.007秒でWALL_300S。完了行6562、開始行6563、段階support_area。命令 `G1 X163.981 Y76.52 E6.06027`。面積照合候補2937、CPU 298.4375秒、最大RAM 150.43MiB。

統合版で支持成立を確認すると、それまでUNKNOWNで受けに数えなかった材料が先行certified材料となる。そのため後続の面積計算と独立polygon unionが増える。これは因果規則を緩めてUNKNOWNを消したものではないが、性能専用版の速度を統合版の拡張性として流用できない。

## テスト・数値・環境
既存42件＋追加6件=48 PASS。既存テストの内容は不変。追加は既知／未知producerの線幅、未設定・更新・ゼロ幅、遅い偽ヘッダ、独立capsule面積解析解、refinement opt-inとbudget UNKNOWN、100組の未知材交差と原因ID順序の一致。
最初のJIT helper命名誤りによる9エラーはTEST_RESULTS_attempt1.txtに保存。名前参照を修正し、最終48 PASSをTEST_RESULTS.txtに保存。実G-codeの予算停止後に自動再試行はしていない。

Python3.12.14 / NumPy2.2.6 / Numba0.68.0 / llvmlite0.50.0 / Shapely2.1.2 / GEOS3.13.1。依存はrequirements.lock.txtとENVIRONMENT.jsonに固定。新規Shapelyは今回の隔離depsのみへ導入。

## 保護・identity
元branch gcode-causal-diagnostic-v1 / HEAD 77ab6d20af86de423c50cd959139ea8e4bbc0352。既存dirty/untracked11件を含む元ファイルSHA、HEAD、statusは再照合して不変。P1証拠・未採用コード・未公開commitは上書きなし。P1最終コードはパッチ適用済み隔離candidateをそのままp1/へコピーし、Drive掲載P1パッチとのバイト一致も確認。

G-code SHA256: 3621f2f42bab5881d7a8dae1045337e0c32e950531261256ed3b7496d8be6744
LIGHT SHA256: ecaa3527c26a6b608191cb4fac4f6d8db6d1c871be2b1adc62854d7f84266415
machine座標のSAVED_LIGHT_SLICE_DIAGNOSTIC。現在の物理ジョブ、CAD変換・Flower/Support IDは未認証。

現印刷アクセス=0、原本変更=0、新規Support生成=0、assembly=0、native slice=0、Send=0、Print=0、merge=0。PR65/67の保護対象コード不変。V2規則不変。`print_go=false`。

## 次に必要な限定技術変更
統合版が予算HOLDの場合、前層の不変なcertified領域のunionを、layer・誤差包絡・入力identityを鍵にして安全に共有できるか検証する。現在は同じ前層材料群について各経路でunionを再計算している。current-layer側はcommit時系列が変わるため、前層と同じキャッシュを使ってはいけない。完全原因・判定・面積上下限の回帰を維持したうえで、10kから別taskとして再検証する。今回はこの追加設計を実装せず停止する。

この成果をV2生成へ投入しない。Authorレビューを待つ。
