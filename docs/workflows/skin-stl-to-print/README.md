# SKIN / FUKEI — STLから花・枝・編集・プリントまで

**入口：このページ。別形状で始める記入用ひな形は [NEW_SHAPE_RUN_TEMPLATE.md](NEW_SHAPE_RUN_TEMPLATE.md)、実在資料と確認範囲は [SOURCE_MAP.md](SOURCE_MAP.md)。**

これはAuthor依頼による**工程の整理と、将来の別形状用の運用提案**です。既存の資料・実装・保存結果をつないで説明しますが、全工程を一括実行できる新プログラムや、任意STLの印刷成功を証明したものではありません。文書登録だけで造形変更、探索、slice、Computer Use、Send、Printを開始しません。

- GitHub：コード、CURRENT、task、recipe、判定と小さい証拠。
- Drive：STL/NPZ/.blend/3MF/G-code、画像、checkpointなどの大容量原本。
- Author：作品の目的、外観採否、作業範囲と次gate、Print GO、実機操作。
- Astra：Authorが委任した造形・接合・製造レビューと印刷データ作成。
- Sol：別taskで明示された操作系・復元・データ受渡し。#58/#59だけを根拠に造形へ進まない。
- LUNA等：その時点のbounded taskの実装・検証。worker自身による全体完了承認は禁止。

## 1. 全体の流れ

```text
00 新しいcaseを作り、元STLと担当・許可範囲を固定
 ↓
01 STLをHost（配置の基準面）として読込／寸法・座標を固定
 ↓
02 花prototypeを選び、Host上に配置
    花ID、位置、向き、実寸、裏側anchorを保存
 ↓
03 現在の花配置に対応するPermanent枝を生成
    枝ID、中心線、径、接続先、生成recipeを保存
 ↓
04 必要なときだけBranch Editorへ受渡し、Authorが枝を編集
    作業コピー＋PROJECT.json。元IDと追加・削除・置換の差分を保持
 ↓
05 編集差分をreviewし、線を製造用meshへ実材化
 ↓
06 印刷中の保持・必要Support・接合・除去経路を確認
 ↓
07 機種／ノズル／材料／plate／processを固定し、許可されたslice
 ↓
08 完成G-codeの実toolpathを監査 → 新しい印刷用package
 ↓
09 GUI Preview／Send dialogの確認 → Author Print GO → Send／Print
 ↓
10 完走・除去後の外周花・外観をLabへ記録 → 次revisionへ
```

**Branch Editorは花や枝をゼロから生成する工程ではなく、生成済みの枝を必要時に編集する道具。** アドオンのインストール／有効化と、作品を選んでBindして操作runtimeを使うことを分けます。STLを普通に開いただけで、花ID・枝ID・接合台帳が自動生成されるわけではありません。

今回のAuthor方針は**外周の花が印刷・Support除去後に残ることを優先**すること。内部の糸引き・荒れ・赤い表示は、それだけで作品の不合格条件にしません。一方、外周脱落、造形停止、保持喪失につながる問題は別に確認します。半透明材料での見え方は、材料trialごとにAuthorが判断します。

## 2. いま使えるものと、未接続の部分

| 工程 | 資料・成果の状態 | 新しい形状での扱い |
|---|---|---|
| STL→花→枝 | Composition Flow V0の設計、R4の花・枝JSON/NPZと生成recipeの参照あり | 同一の完成アプリとして自動接続されたとは未確認。実行する実装commitとrecipeをcaseごとに指定 |
| Branch Editor 0.1.0 | PR #59の配布ZIP、隔離install、操作kernel比較、fresh reopen、同環境移設のPASS記録 | **既存MINIA/LOWER70を対象とする**。任意surface/structure JSON importerではない |
| 新しい花・枝→Editor | 花・枝のIDデータは実在 | 新caseの台帳／属性／cache／PROJECTへのadapterと往復検証が別途必要 |
| 編集→製造mesh→印刷 | 旧MINIAの製造実績、編集後の工程契約あり。AuthorはAstraへ印刷データ作成を委任したと報告 | Astraの現在の製造handoffを確認。旧成功packageやRUN_007を最新の補強済み印刷データと見なさない |
| 汎用・一括・別形状E2E | この文書では未検証 | 各caseのgateを新規記録。未接続工程を実装済みと書かない |

PR #59は確認時 **Draft / open / 未merge**、HEAD `b63538933969e570b50e8ea46a7e3b70f624744f`。実GUI、別PC、companion Start/resume、Drive cloud同期は未確認です。保存済みテストの読取整理であり、本資料作成で再実行していません。[S02–S05]

**ソフトウェア成果物の保存・移設、同じ入力の再生成、別形状への転用、物理印刷成功は別の再現性です。**

## 3. 工程別の入力・操作・保存物・終了条件

### 00｜新規caseとauthority

[ひな形](NEW_SHAPE_RUN_TEMPLATE.md)を新case用にコピーして、小さいGitHub記録と独立Drive出力先を作ります。既存case、archive、稼働job、dirty/unpushed workを再利用の名目で上書きしません。

記録するもの：case ID、STLの所在とSHA/bytes、Authorの目標寸法、花family、担当、選択recipe、操作・sliceの許可範囲、既存成功例との関係。未決は未決のままにし、古いMINIAの値を自動補完しません。

**最初の次gate：入力の識別・使用する工程・不足の確定。** 新STLがまだ指定されていないときは、この資料を保存しただけで制作開始にしません。

### 01｜STLをHostとして読み込む

入力：新しいSTL原本。Blenderまたは対応するKatachi側のimporterを選びます。

既存Composition設計は、原本座標を保持し、source単位の解釈、Z-up等の基底、sceneへの変換を明示する方式です。**Hostは花を配置する参照面であり、その中身を必ずソリッドとして印刷するという意味ではありません。** [S06]

別形状では、mm解釈、目標実寸、X/Y/Z範囲、軸の向き、source→working→plateの変換を固定します。既存MINIAの0.733333…やtranslationを流用しません。flowerの物理サイズをHost縮尺へ自動追従させるかも別の決定です。

Hostを内部判定に使う場合、選んだ処理が要求する閉面・法線・内外判定条件を検査します。不明な表面を黙って修復したり別形状へ置換しません。修復が必要なら原本を保持した別revisionでAuthorへ返します。

保存：STLのidentity、採用した単位・座標変換・寸法、使用importer/recipeのversion、必要な`host.npz`等。NPZの存在だけで元STLとの対応が証明されたことにしません。

### 02｜花prototypeと配置

花そのもののmeshと、花の配置instanceを分離します。prototypeにはfamily/template ID、原本mesh、local frame、front/back、接続anchorの定義を保持します。

配置ごとに保存する情報：花ID、prototype参照、位置・回転・実寸scale、Host上の面との対応、裏側接続anchor、配置recipe・seed・実結果。[S06–S08]

既存に二系統あります。混ぜて一つの完成方式としません。

- **Composition V0（設計）**：面積に基づくsampling、固定seed、instance transformによる配置。64/32花などは機能試験用条件で、作品密度の標準値ではありません。
- **R4/D6（保存アセット・recipe参照）**：`surface.json`、`D6_local.npz`、size assignment、natural contactsなど。別TARGETは`placements.npz`＋locked D6 meshをgeometry authorityとし、JSONを検査用mirrorとして扱う指定があります。

表示・再生成・保存は実instance数を使います。花配置を変更したら旧枝と旧接触評価をSTALEにし、同じID名という理由だけで古い接続を残しません。

終了条件：配置・向き・大きさ・ID対応が確認でき、Authorがその花配置を次の枝生成の入力として選べること。**裏anchor座標があることは、枝がすでに接合した証明ではありません。**

### 03｜現在の花配置からPermanent枝を生成

入力：同じcase/revisionのHost、prototype、花配置、anchor、選択した枝recipe。必要な場合は実花同士のnatural contact情報。

既存`structure.json`には`id / kind / points_mm / parent_id / target_id / radius_mm / diameter_mm / tip_diameter_mm`等があり、花と枝をIDで関連付けます。表示中心線、宣言された接続、実材meshの接合は区別します。[S08–S09]

- R4実構造familyにはROOT_ADDITION、SHARED_CORE、SHARED_TWIG、FLOWER_BACK_ATTACHMENT、INTERNAL_SPATIAL_LINK、ASCENDING_BYPASS等の記録があります。
- Compositionの`inset-relay-mst-v0`は別のauthoring原型です。R4の枝生成器や印刷強度の代用品にしません。
- #36の「旧Host/core 106部材を保持」は**同じHost系から花配置を変えるTARGET taskだけ**の指定です。別形状へそのcoreや3本のLR、旧Supportを持ち込む規則ではありません。

別Hostでは、新Hostに対応する基部・内部core・花依存枝を、選択recipeから生成／検証する必要があります。過去の本数（4,240、4,243、9,421等）を新caseの達成目標にしません。

保存：枝record、recipe/version/parameters、入力hash、花↔枝↔接合の対応、生成結果と未確認接触。再開では保存した結果を読むのか、固定recipeで再生成するのかを明示します。

### 04｜必要時だけBranch Editorへ渡す

**既存MINIAを開く場合**は、PR #59の[導入・復元手順](https://github.com/satw-jp/katachi/blob/b63538933969e570b50e8ea46a7e3b70f624744f/tools/skin_branch_editor_addon/ADDON_INSTALL_AND_RESTORE.md)を使います。

1. 配布ZIPと依存物をSHA照合し、独立した作業フォルダ・隔離Blender設定を用意。
2. 対応するwork copyを開き、`PROJECT.json`を明示選択してBind。
3. 2点→F、途中点追加、色更新、1/4画面・clip、保護付き区間削除などを行う。
4. CURRENT/STALE/HOLDを確認し、作業コピーだけ保存。再起動・再Bind後の状態を確認。

**別形状の場合はここに未接続部分があります。** 現`create_project.py`はSHA固定の`MINIA_LOWER70_BRANCHING_REVIEW.blend`と埋込ledgerを要求します。新STLや任意`surface.json`を渡せる関数ではありません。検査をOFFにしたり、MINIAのcacheへ新座標を混入して通してはいけません。[S04]

別taskで用意すべき受渡しは、既存形式を尊重した次の最小adapterです（**本資料では設計上の接続点、未実装扱い**）。

```text
同じcaseのHost＋花配置＋枝record＋接合・保護情報
 → 座標とIDを保持したEditor用ledger／属性／必要cache／project binding
 → Authorの編集済みwork copy
 → 元のcase ID付きの追加・削除区間・reroute等の編集差分
```

`PROJECT.json`はEditorを正しい作品データへ結び付けるmanifestです。STLから製造までの全情報を自動生成する万能ファイルではありません。現schema `MINIA_EDITOR_PROJECT_V0`を未知のcaseへ無断拡張しません。

**確認事項**：no-op保存の意味的同一性、旧部材IDと新線ID、単位と変換を一度だけ適用、未知IDや保護改変はHOLD、編集後の色をSTALEにすること。新caseを受け渡す検証が通るまでは、その先の実材化へ進みません。

### 05｜線・編集差分を製造用meshへ戻す

Astraの現行task/製造handoffに委任する工程です。表示用Curveや細いproxyをそのまま印刷用としません。

旧V1の工程契約は「成功版native/repacked baselineを保持し、新枝だけ追加」です。一方、後のAuthor workspaceは削除maskと承認済みrerouteを持ちます。**後の編集を古い追加専用extractorへ渡して、削除・置換を捨ててはいけません。** 対応する差分versionと実材化処理を明示します。[S10–S11]

- 同一MINIAの局所修正：元のFlower、既存native mesh、Support、placementを、許可された差分以外は保持。sourceから全体を作り直さない。
- 新規Host case：そのcaseで受け入れた花・枝をbaselineにする。旧MINIAの原本不変条件を、新形状を生成できない理由にはしない。ただし他caseの製造原本には触らない。
- 新線の径・接合長・端部形状・下層からの成立を設計。見た目の交差だけでは接合PASSにしない。
- 追加／削除／置換部材のID、mesh範囲、接続先、座標変換と検証結果を保存。

出力：新revisionのeditable製造3MF/役割別meshと変更台帳。**旧`plate_1.gcode.3mf`は実経路の比較基準であり、枝編集の入力ではありません。**

### 06｜保持・Support・除去を確認

Permanent（作品に残る枝）とRemovable Support（取り外す支え）を別に扱います。新しいHost/花/枝に、別caseのauthored Supportを自動再利用しません。authored Supportかslicer生成Supportかはcaseの製造設計で明示し、重複追加しないこと。

評価対象は、印刷中の保持、花との接合、Support除去後の外周花、除去作業の空間。内部全体の美観や赤ゼロをhard gateにしません。

**評価の区別**：現optimizerの赤は全体graph上の支持距離・合流補正というheuristic。過去V2の限定layerwise独立ルート解析とは別です。局所的な2/3ルートも、基部までの独立性や離れた複数接点を必ず保証しません。[S11]

geometryの保持予測、actual toolpath、実物の保持を別に記録します。浮遊・細い接点・接合不足の警告は対象IDと根拠を残し、無関係のPASSで消しません。

### 07｜機械条件を固定し、slice

既存Runner/Consoleの**現行の承認済み実行契約**を使い、並列の新Runnerや疑似コマンドを本資料で発明しません。既存`SLICE_JOB.json`、input locks、実行context、`RESULT_MANIFEST`を参照します。request key一致は、環境互換性・完成G-code一致・Print GOを保証しません。[S12]

caseごとに凍結：機種、ノズル、材料と実spool、実plate、layer/first layer、line width、温度、冷却、速度/加速度、flow制限、retraction、infill、Support、raft/brim、resolution等。原preset名だけでなくresolved valuesと出典を保存します。

#38で標準startupの欠落が記録されています。`inherits/include`を解決し、機種固有startup/endや関連templateを確認してから実行します。成功Benchyのstartをそのまま移植する手順ではありません。[S13]

実行回数・上限・監視・中断理由を事前指定。重い全量Previewとsliceの無計画な同時実行を避け、空きRAM/commit余裕を確認。監視例外、slicer自体の失敗、強制停止、OOMを区別し、精度緩和や自動retryで隠さないこと。

出力の実在・完成marker・exit status・入力前後identityを確認し、層数、max Z、時間、材料量、warningを保存。`.gcode.tmp`や途中ファイルを完成品へ昇格しません。

### 08｜actual toolpath → 印刷用package

新しいG-codeに対し、初層、追加・変更部の初出、花接合、Support接点、下層からの連続、浮遊警告、経路消失等の必要箇所を確認します。どこまで確認したかを明示し、局所監査を全体保証にしません。

完成G-codeから、承認済みのpackage-only/DEFLATE等の経路で新しい`*.gcode.3mf`を作成します。embedded G-codeとstandaloneのSHA/bytes一致、ZIP CRC、plate/layer情報、機種/材料/使用量・mappingなどを照合します。[S10, S14]

**editable 3MF、完成G-code、G-code入り3MF、再現用manifest、配布アドオンZIPはそれぞれ別の成果物です。** ファイル名が似ていても置換しません。圧縮packageが小さいことも、全量Previewの省メモリ保証にはなりません。

### 09｜Author Print GO → Send／Print

許可された方法でBambu Studio等のPreviewとSend dialogを確認します。Headless検査はGUI操作済みの証明ではありません。Computer Useの許可がなければAuthor操作で確認し、別の未確認欄を残します。

Print GOは、**exact package SHA、case/revision、機種、ノズル、材料/plate、残存warning、試験目的**を指定してAuthorが判断します。Send dialogが開く／ボタンが有効であることと、Sendしたことは別です。中断済みrunのGOを次runへ自動再利用しません。

この資料にも、#58/#59にも、実Send/Printの包括許可はありません。新caseの次の具体的な実行gateを受け取ってから進めます。

### 10｜Physical evidenceとAuthor ACCEPT

Labに写真・必要なログ・観察を保存し、case ID、印刷package SHA、run ID、材料/機械、完走/停止、Support除去前後を対応付けます。写真のファイル名やupload時刻だけで別個体へ結び付けません。

今回の優先観察：外周花の生存／まとまり脱落、外形保持、印刷・除去での問題。内部の粗さは記録しつつ、Authorの許容範囲を別に残します。半透明材料は透け・内部の見え方・接合跡を同じ観察条件で比較する計画とし、既存の白PLA評価をそのまま移しません。

`Physical PASS`は試験目的に対する物理結果、`Author ACCEPT`は作品としての採否です。どちらもsoftware PASSから自動付与しません。

## 4. 花・枝に付随する既存データ

| 既存形式／記録 | 意味・注意 |
|---|---|
| STL / `host.npz` | 参照形状。元STLとの対応・単位・変換を保持 |
| prototype NPZ / local frame | 花本体のmeshと向き・接続anchorの原定義 |
| `surface.json` | R4の花ID、position、normal、orientation、scale、Host対応など |
| `placements.npz` | TARGET等での配置geometry authority。JSON mirrorと優先度を混同しない |
| `flower_back_anchors.json` | 接続候補座標と状態。`CANDIDATE_UNCONNECTED`は接合済みではない |
| `structure.json` | 枝の種類・中心線・径・接続先・親子関係。これだけで全実材接触は証明しない |
| `natural_contacts.json` | 指定配置・meshの接触検査結果。別配置や別花prototypeには失効 |
| `.blend`内ledger/属性/registry/masks | EditorのID対応と編集意図。追加線・途中点・削除・rerouteを区別 |
| `PROJECT.json` | Editor版・作品・hash・transform等のbinding。現v0はMINIA専用条件 |
| `.skincomp` | Composition設計の自己完結authoring package。存在する完成汎用形式だとは本資料で主張しない |
| `SLICE_JOB` / locks / result | 製造実行の入力・環境・結果。上のauthoring projectとは別 |

**JSONだけで花の詳細meshを復元できるわけではありません。** prototype等のバイナリ、recipe、source version、対応する変換が必要です。hashは同一性確認用で、失ったデータを復元する仕組みではありません。

## 5. 他の形状を試すとき、何を再利用・再計算するか

| 変更 | 再利用候補 | 再計算・再確認が必要なもの |
|---|---|---|
| 別STLへ交換 | 花prototype、選択した生成アルゴリズム、Editor操作、監査・package処理 | Host変換、花配置、全Host/花依存枝、接触・保持・Support、製造meshとslice |
| Host寸法だけ変更 | 元STL、prototype、recipe | scaleの意味、花の実寸方針、配置/接合/細部、工程下流。旧MINIAの縮尺を無条件適用しない |
| 花family/位置/サイズ変更 | Host、Editor操作 | anchor、natural contacts、花依存枝、保護ID、Support、下流mesh/toolpath |
| 内部枝を局所編集 | 同caseのHost/花と許可範囲外のbaseline | 接合、削除・置換、影響する保持とSupport、製造差分、toolpath |
| 材料/ノズル/process変更 | geometryが明示的に不変ならそのgeometry | resolved profile、startup、slice/toolpath、接着・除去・実物見え方 |
| UIの表示・インストール先だけ変更 | 意味的編集データと製造baseline | runtime/binding/保存復元/操作パリティ。勝手に再sliceしない |

同じinput hashだけで、異なるrecipeや環境の出力を再利用可能とは判定しません。失効したcache・結果は`STALE`、原本との混同や未対応編集は`HOLD`として残します。

## 6. gateの書き方

一括の「technical PASS」だけで閉じず、少なくとも次を分離します。

| Gate | 証明する範囲 |
|---|---|
| Source / data binding | 正しい版とID・座標で工程がつながる |
| Authoring / Editor software | 入出力・編集・保存・復元が指定条件で成立 |
| Geometry | 意図した製造mesh・接合・保護差分の検証範囲 |
| Slice | 指定条件で完成出力を得た |
| Toolpath audit | 指定した箇所で実押出経路を確認 |
| Package integrity | payloadとmetadata/CRC/機種等の整合 |
| GUI / delivery check | 実画面で確認した範囲。未送信なら未送信 |
| Author Print GO | 対象package/runへの明示許可 |
| Physical | そのrunの完走・保持・除去後等の物理結果 |
| Author ACCEPT | その作品・目的としての採否 |

未実施は`NOT STARTED`、証拠不足は`UNVERIFIED`、問題で停止は`HOLD`。任意工程を省略するときは理由付き`NOT APPLICABLE`とし、未実施をPASSにしません。

## 7. 未接続部分と次の最小作業

現在の資料だけで保証できないのは、主に以下です。

1. **新STL＋選択recipeでの花・枝生成実行環境**：Composition設計とR4系を選び分け、使う実装と入力を固定すること。
2. **新case→Branch Editorのadapter**：MINIA専用検証を壊さず、ID/transform/registry/保護/cacheを新caseへbindingすること。
3. **現在の編集表現→実材化の対応**：追加だけでなく削除mask/rerouteを含む場合、Astraの現行実装・検証範囲を確認すること。
4. **別形状での端から端までの実証**：印刷package完成と物理結果を新caseに結び付けること。

これらを解消せず「STLを差し替えるだけ」と説明しません。また、一括で全機能を新規開発する必要もありません。**まず新caseの入力・既存tool適合・最初の不足を一つ確定し、対応する担当へbounded taskを切る**運用を提案します。

## 8. 次回の1行依頼

> このSTLを新caseとして `docs/workflows/skin-stl-to-print/README.md` に沿って進めるため、実物のCURRENTと入力を確認し、NEW_SHAPE_RUN_TEMPLATEを埋めて最初の未接続工程と次gateを提示してください。既存MINIA/Astra/Solの原本・job・HOLDは変更せず、造形生成・slice・Computer Use・Send・Printは各工程の明示許可前に実行しないでください。

**最初のSTOP（本資料で提案する計画用名称）：`NEW_SHAPE_PIPELINE_PLAN_READY`。** これは既存ソフトの実装済みstatus enumではありません。

---

出典のS番号は [SOURCE_MAP.md](SOURCE_MAP.md) を参照。既存sourceの意味を保存し、将来の運用提案は実装済みの事実と区別しています。この文書のためにテスト・生成・印刷を再実行していません。
