# MINIL LOWZ50 保存LIGHT G-code診断

STOP: `LIGHT_GCODE_SUPPORT_DIAGNOSTIC_READY_FOR_REVIEW`

`SAVED_LIGHT_SLICE_DIAGNOSTIC`。現在の印刷との同一性はUNBOUND。印刷可能PASSではない。

## 完了範囲

保存G-codeのmachine Z 0〜50mmを、実線幅の押出領域と時系列で解析した。後続4層の追跡のためZ50.41mmまで読んだ。CAD Z 0〜50mmとの完全一致は未認証。

| 分類 | 解析span数 |
|---|---:|
| UNSUPPORTED_FIRST_EXTRUSION | 2,017 |
| MARGINAL_SUPPORT | 0 |
| SUPPORTED_TOOLPATH | 43,626 |
| UNKNOWN | 11,022,768 |

単位は最大2mmの順序付き解析区間。同じG-code命令を分割した区間を含み、花数・故障数ではない。未支持を含む連続押出パスは2,017件。トラベル／引き戻し／層変更で分けたパスであり、独立CAD成分数ではない。

ラフト2層と通常造形はRAFT_BODY_COUNTS.jsonで分離。通常造形のSUPPORTED_TOOLPATHは0span。これはラフト空隙をまたぐ荷重伝達を認証していない厳格な伝播条件の結果であり、作品全体が支持されていないという物理判定ではない。

## 事実・推定・未確認

- **確認済み:** 指定3ファイルのSHA一致、archive内G-codeと単体G-codeの一致、originのLIGHT参照、保存設定Textured PEI65°C。終了後も3原本のSHA一致。
- **確認済み:** ラフトL1 Z0.20、L2 Z0.50、作品初出L3 Z0.70。最初の作品経路のlayer heightと下層との差は隙間として記録し、下層材料を消して未支持扱いすることは避けた。
- **確認済み:** 元LIGHTのcomponent/build変換を再取得。足の独立した87対応でXY identity仮説を照合。全体外形も既存+0.15mm輪郭補正と整合するが、CADの積層位相はUNBOUND。
- **判定上の制限:** ラフト空隙の荷重伝達を未認証とし、健康な支持体として無条件に伝播させない。このため後続UNKNOWNが多い。UNKNOWNを未支持確定や印刷失敗の件数として使わない。
- **幾何的検出:** UNSUPPORTEDは、前層と同層先行のraw材料外側包絡にも重ならない区間。浮遊経路を正常支持へ昇格しない。実際の垂れ、糸引き、接着、振動、座屈、破断は未評価。
- **構造の推定:** 0.20mmのraw接続グラフで根元連続、合流のない高さ、細幅、分岐・集中を抽出した。無合流高さ最大49.80mm。これはSupportの無補強長の確定値ではなく、花／枝／neckの所有IDは未割当。
- **未確認:** バックアップの欠落object_20.modelは復元していない。現在の実機条件・実行ジョブ、Flower/Support ID対応、CAD Z位相、donor全経路と除去性は未認証。

## 数値条件と検証

格子0.05mm、半セル対角0.035355339mm、円弧最大sag0.002mmに半径丸め差、引戻し残差の未充填長を加えた内外包絡。単なる許容差緩和は行っていない。面積重なり下限50%をスクリーニング閾値とし、25/50/75%感度を代表経路へ保存。物理的な許容基準ではない。

新規28テスト、既存67テストPASS。過去Bの既知未支持4事例も再検出したが、BのUID・座標はLIGHTへ転用していない。高速実装と独立NumPy実装の一致、円弧・実線幅・未来／浮遊材料除外・raft gapを回帰検証。

独立した命令一覧検査はG-code 24,072,211行目まで完了。G10/G11、インチ単位、非XY円弧平面、M200、層内XYZ座標リセットの該当フラグ0。過去Bの検証はSHAを固定した押出cacheを使う判定器回帰であり、LIGHTの入力ではない。

実行時間1773.2秒、最大working RAM 1.139GiB、終了時process commit 1.628GiB。全原本・解析コードSHAは保存。

## V2接続

証拠付き需要として表現できるパス2,017件、現在生成器へ投入可能と認証した需要**0件**。全経路・線幅・行番号・先行支持判定・後続4層をEVENTS.jsonへ保存した。機械→CAD位相、対象面／法線、先行donor、経路・周辺UNKNOWN除外が通過してから既存V2へ接続する。開始点だけを接点にせず、元shaft/neck/foot/braceの寸法・選択規則は変更しない。接続仕様はGCODE_DEMAND_INTERFACE.md。

## 次の判断と保護

Authorレビュー対象は検出器・実経路証拠・需要仕様。新しいSupportの生成承認ではない。既存のCOPLANAR_FACEと21,905件のCAD UNKNOWNは別HOLDのまま。旧8本と改善値は再利用していない。

実MINIL向け形状生成0、原本変更0、新規native slice0、Send0、Print0。PR65不変、PR67 Draft・未merge、`print_go=false`。

FOLLOW-UP: machine ZとCAD断面位相、およびラフト空隙をまたぐ支持伝達の判定条件を認証する。それまでは大量のUNKNOWNを閾値緩和でSUPPORTEDへ変えず、生成器のdonor／経路認証ゲートを維持する。

## 成果物

- INPUT_BINDING.json / FINAL_INPUT_PRESERVATION.json / COORDINATE_ANCHORS.json
- accepted_machine_lowz50/RESULT.json・MOTION_DIAGNOSTICS.csv.gz・EVENTS.json・LAYERS.json
- HEIGHT_COUNTS.csv / EVENT_INDEX.csv / STRUCTURAL_SCREENING.json
- LIGHT_LOWZ50_XY.png / LIGHT_LOWZ50_HEIGHT.png
- TESTS_ACCEPTANCE.txt / TESTS_EXISTING.txt / HISTORICAL_REGRESSION.json

中断・修正前走査はfirst_layer_check*、full_machine_lowz50*として隔離保存し、集計には採用していない。

## 保存先・局所再検証

代表8例を元G-codeから再抽出。未支持6例の独立GEOS外側包絡はすべて非交差。0.025/0.05/0.10mmの3格子すべてで同じ判定は4/6例。格子を粗くしてUNKNOWNになる場合もそのまま感度記録に残し、判定閾値は調整していない。別の2例はUNKNOWNの受けを可視化した。前層と同層先行の実経路・行番号・生G-code・交差面積をREPRESENTATIVE_LOCAL_EVIDENCE.jsonへ保存。全2,017例への独立GEOS再計算とは区別する。

[Drive証拠フォルダ](https://drive.google.com/drive/folders/1dlEdHSax41MAaLawKaUh7aFZNBHhwwhX)。GitHubはPR #67の新規toolpathモジュールと本監査サマリを参照。

最初の未支持spanの長さ中央値は0.1873mm、0.05mm未満は145件。後続を含むパス長中央値は1.3550mm。微小な初出も隠さず保存しているが、この件数・長さだけで損傷の重大性を断定しない。

branch: `agent/minil-support-lowz50-program-v1`。ローカルHEAD `f5febf59a47d1d90f6a0bcc7c0df43cc43654db4`、dirty保持。既存52ファイルの退避版との内容一致。リモート更新の基準HEADは `e6cf883b974e22329945f02fb546d330a5085324`、lease付き更新で他者変更を上書きしない。ローカルのreset/rebase/cleanは行わない。
