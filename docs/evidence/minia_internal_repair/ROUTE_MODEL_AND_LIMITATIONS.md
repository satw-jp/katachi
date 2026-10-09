# MINI_A 独立保持ルート／単一破断リスク — 設計契約

2026-10-09 JST。追加task: `MINIA_LAYERWISE_HOLDING_ROUTE_VISUALIZATION`。

状態: **MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW**。基本Editor V1は先行納品済み。V2のheadless data/operator検査、保存・fresh再読込、Astra reviewを通過した。Author GUI操作・使いやすさと実強度は未確認。個別の根拠はTEST_RESULTS.json / DECISION_OWNER_REVIEW.json。

実測済みの範囲: `SELECTED_GEOMETRY_CONTACTS.json` と `SELECTED_GEOMETRY_HEIGHT_CACHE.json` はF3457周辺の18実mesh（5 Support含む）、モデル高さ（変換後のplate Z）0–156 mm / 0.2 mm間隔の分離片と接触を記録する。`PERMANENT_BASE_EVIDENCE.json` は宣言基部R0000/R0001の実形状下端を検査し、他の全実材のbed接触を網羅したとはしない。`GCODE_SELECTED_EVENT_CHECK.json` は旧G-codeの3命令位置と層高さの再照合であり、基部までのtoolpath経路証明ではない。

## 評価の意味

評価点・対象領域・故障単位を別に保存する。基部までの経路はモデル全体で追い、表示cropの端を基部にしない。対象の細い付け根や共通接合を、表示領域に含まれるという理由で故障評価から除外しない。

- 独立保持ルート数: 同じ物理branch IDを共有しない、評価点から基部までの経路。表示は0/1/2/3以上。得られた経路のbranch/contact列を最大3本保存する。
- 共通接合部への依存: 上記の枝独立性とは別に、joint IDを一つ無効化した場合の基部接続を評価する。評価点に属する接合部も明示的に評価し、暗黙に無敵の端点にしない。
- 一本破断時の分離範囲: branch IDに属する全解析片、またはjoint IDを解析上だけ無効化し、以前基部につながっていた部分の接続喪失を比較。影響する部材ID・花IDを重複なく数え、部分喪失と部材全体の喪失を区別する。
- 対象点で2ルートになっても、その点と対象の花群の間に共通の枝が残れば、その依存を別に表示する。評価点の値を対象花群全体の独立性へ読み替えない。

## 再利用とgraph表現

既存 `R4_A_MINI_LOCAL_LOBE_R1` のLOBE台帳とNetworkXによるbridge/接続成分処理、sourceの親子/cross-link、正の重なりを測った既存接触記録を再利用する。既存結果はsource/ID対応を確認してから取り込む。新しい汎用graph基盤・FEAは作らない。

解析片IDとphysical `branch_id` / `joint_id` は別。高さで切った同じ部材が複数の分離片になる場合、そのIDだけを理由に片同士を接続しない。反対に、線分を分割しただけで独立性の容量を増やさない。

候補経路の探索には既存graph上の容量付きflowを利用できるが、最終的に各経路の物理branch ID集合が相互に素であることを検査する。分離片が共通故障単位を持つために通常flowの解が過大になる場合、確定した下限/上限と未解決を返す。上限だけを独立ルート数にしない。無制限の全経路列挙はしない。0/1/2/3以上の表示を確定できない場合は灰色・未確認にする。

## 二モードと基部

- `PRINTING_WITH_SUPPORT`: 印刷途中のPermanentと有効なSupport接触。基部は実際の造形面/raftへの接続ID。下から受ける `BEARING_CONTACT` と一体化した `FUSED_CONTACT` を別分類し、仮定として含めた接触は表示する。引張/曲げ能力が等しいとはしない。
- `PERMANENT_ONLY_AFTER_REMOVAL`: Supportと取り外すraftを除外。完成品に残るPermanentの基部IDを使う。印刷時の基部を無条件で流用しない。

初版ではSupport除去順序最適化や任意の除去途中モードを追加しない。

## 高さと根拠

部材の最低Zを超えただけで全長を有効にしない。選択領域と依存接合は実材の高さ以下の部分・接合を確認し、未造形部分を通る経路を除く。部材内で分離する片を保持する。経路をZ単調減少には限定しない。

領域外の軽量graphに宣言接続や近似が残る場合は、その範囲を記録する。中心線clipを実材全域の接続検証と呼ばない。接触の成立高さは接触部分の実geometryから求め、正の体積の成立を確認する。未知接触は未知のまま保持する。

接続ごとの根拠:

|状態|意味|
|---|---|
|`DECLARED_CONNECTION`|台帳上の親子/cross-link。実材の接合証明ではない|
|`GEOMETRY_CONTACT_VERIFIED`|対応する実材接触を確認した範囲。物理接着強度の保証ではない|
|`TOOLPATH_CONNECTION_CHECKED`|指定layer/命令位置までの実押出を確認した範囲|
|`UNRESOLVED`|対応または接合が未確認|

geometry層末の結果は `GEOMETRY_LAYER_END_ESTIMATE`。同じ層の途中順序を確認した意味にしない。既存G-codeは命令位置・layer・machine Z・model Zを分け、Z-hopを積層高さへ数えない。新規追加線は `DESIGN_INTENT_PREDICTION / TOOLPATH_UNVERIFIED`。旧G-codeの結果を新枝へ流用しない。

## 初回の実領域とG-code参照

実破損の3D位置は未確定。既存の局所接触・G-code記録がある `F3457 / A3457 / G0181` 周辺をデモ候補とする。初回表示はF3457、モデル高さ43.2 mm、PRINTING_WITH_SUPPORTに固定する。Authorの破損箇所とは断定しない。

既存 `R4_MINIA_TERMINAL_REVIEW_20260922/representative_extract.py`、`representative_review_F3457.json`、`GCODE_LAYER_INDEX.json` を参照する。旧記録はraft offset +0.6 mmを仮定し、局所押出の存在と重なりを示すが、基部までの経路や部材別の押出帰属を証明していない。仮定を解消せず全保持経路を `TOOLPATH_CONNECTION_CHECKED` に昇格しない。既存成功G-codeの必要な命令範囲のみread-onlyで照合し、新規sliceはしない。

## 表示・編集とキャッシュ

紫0 / 赤1 / 黄2 / 青3以上 / 灰未確認。常にモード、高さ、根拠、未確認事項を表示する。未確認がある場合は「既知1／未確認接触あり」等とし、実際に一本しかないと断定しない。青を安全表示にしない。共通jointの警告はルート数と別に出す。

Authorの操作は、領域を選ぶ→高さ/モードを変更→枝を追加→再評価→前後比較→別名保存。新線の接続先は元anchorのID対応を使い、近さだけで推定接続しない。

編集、対象、モード、高さ、基部、接合台帳の変更で以前の結果を `STALE` にする。再評価前の色を現在の結果として残さない。キャッシュキーはbaseline hash、編集差分hash、接合台帳hash、解析version、対象、基部ID、モード、接続状態の高さeventを含む。高さ変更のたびに3MFを展開せず、全layer meshを保持しない。

## Focused tests / gate

共通幹の三分岐、共通joint、上層で第二経路が成立、同層の接合命令前後、Support込みと除去後、中心線交差だけ、実材接触の追加、crop境界、線分分割/no-op、STALE、部材/花の重複のない影響集合を小さいfixtureで確認する。

次に実領域のTEST_ONLY追加線で前後比較し、Author用ファイルへ混ぜない。保存後のfresh Blender processで再読込を確認し、応答時間・メモリを実測する。GUI Computer Useは行わず、software/operator検証とAuthor実操作・使いやすさの採否を分ける。

STOP: `MINIA_LAYERWISE_ROUTE_VISUALIZER_READY_FOR_AUTHOR_REVIEW`。Source binding、解析tests、geometry確認範囲、旧G-code確認範囲、Blender保存/reload、Author操作、Physical強度を独立して報告する。未達を全体PASSにしない。

## 実データbackendで確認した結果

モデル高さはsource→plate変換後のZ。平面はZ=hであり、変換のZオフセットをもう一度引かない。旧G-codeのmachine Zとは別である。

F3457は43.2 mmで単一の実材片。Support込みでは、18mesh内の正の重なりとモデル基面までの経路を二本確認した。SupportとPermanentの接触はBEARING_CONTACTという仮定を含み、実際のraft接続や接着強度を証明しない。Support除去後の入力graphでは0だが、未確認接触が残るため、実物に経路が無いとは判定しない。

45.0 mmでは入力graph上でSupport込み3以上、除去後1。除去後の共通枝はA3457 / C0016 / G0181 / R0001。このPermanent経路には宣言接続が残る。すべて実物の確定ルート数としては灰色の未確認表示とする。

安定した単一F3457片となる43.0 mm以降の接続単調性を仮定したevent探索では、除去後の1本目は44.6 mm（直前grid44.4）、2本目は156 mmまで未発見。44.6–156 mmは入力graph上の一本依存区間推定であり、全実材の証明ではない。未計測の偶発接触、宣言親への投影、geometryの限界を含む。時刻は推測しない。

TEST_ONLYの局所追加線R5_F3457_P1 END→G0165 ENDを45 mmで比較すると、除去後1→1、共通枝は4本からC0016/R0001へ減る。局所的に迂回しても基部まで独立した第二経路にならない例であり、作品への提案・採用ではない。

runtimeは保存済みの6.6 MB高さ接触cacheを利用する。スライダー変更で巨大3MFを展開しない。source JSONは起動時にhash確認し、稼働中のsource/contactファイル変更をSTALEとして検出する。外部ファイルを変更して同サイズ・同mtimeへ偽装する操作は想定しない。
