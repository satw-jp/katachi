# Hikari 統合マスタープラン R0 — レビュー反映版

作成日: 2026-08-03
状態: **統合アーキテクチャGO／実行計画条件付きGO／SSOT昇格HOLD**
対象リポジトリ: `satw-jp/katachi`
SSOT昇格条件: 本書の`SSOT-0`完了とレビューGO

## 1. この文書の現在の権限

本書は、OPT、KAT、GLOW、ARTを一つの制作系として統合する**正本候補**である。Draft PR stackへ収録しても、`main`へmergeされて`SSOT-0`がGOになるまでは、既存handoffやGit履歴の状態を上書きしない。

`SSOT-0`がGOになるまでは、次の運用とする。

- accepted commitの事実はGit履歴と各stageの受入報告を優先する。
- 詳細な実装契約は既存handoffを優先する。
- stage間の名称、依存関係、次に着手可能な仕事は本書をレビュー案として使う。
- 新しいproduction stageは開始しない。SSOT-0の文書作業と、既存OPT-1c candidateに対するread-only evidence取得だけを進められる。KAT-2a、GLOW-A1など準備laneの実装開始はSSOT-0 GO後とする。

SSOT昇格後は、現在状態、統合ID、依存関係、accepted baseline、candidate commit、blocking decisionを本書だけが決める。詳細仕様は各専門文書へ委譲する。

## 2. 統合アーキテクチャ

Hikariは次の四系統を、一つの制作系として管理する。

| Stream | 責務 | 正しさ／表現の位置 |
|---|---|---|
| OPT | 光学イベント、台帳、View／Receiver観測、DEBUG LAYERS、物理的Light Drawing | 光学的な正しさ |
| KAT | 手動造形、Study導線、Sag由来配置、非破壊preview、採用 | 形の制作と凍結 |
| GLOW | Flow粒子の3D履歴、時間減衰、HDR発光、bloom | 独立した時間表現 |
| ART | PHENOMENON、環境合成、Ambient、M4 preview、決定論的連番、RTX Final | 作品構成と出力 |

```text
KAT: 形をつくり、採用して凍結する
                  |
                  v
OPT: 同じ形から生じる光を正しく分類・観測する
                  |
        +---------+---------+
        |                   |
        v                   v
GLOW: 時間表現          ART: 作品画面への構成
        |                   |
        +---------+---------+
                  v
       Ambient + 連番出力 + 実作展示
```

KAT-3／4の完成は作品v1をblockしない。既存の手動造形・実作由来の凍結形状を使ってOPTとARTを進められる。

## 3. 用語と境界

### 3.1 二種類の「光の筆跡」

| ID | 名称 | 入力 | 判定 |
|---|---|---|---|
| OPT-LD | Optical Light Drawing | 形状、曲率、厚み、ray hit、receiver deposit | 光学的因果、Blender／実作比較 |
| GLOW | Afterglow / 光の残光 | Flow particle position、3D trajectory、time | 見た目、時間感覚、性能 |

Afterglowをreceiver hit、optical energy、`FrameTransportLedger`、OPT-1 layerへ入れない。Natural回帰画像やOPT-LDの不足をGLOWで補わない。

### 3.2 重複IDの読み替え

- Light Layers仕様のR0.5 = `OPT-0.5`
- Light Layers仕様のR1 = `OPT-1a〜OPT-1e`
- 形態再編計画のR1 = `KAT-1`
- 形態再編計画のR2a〜R5 = `KAT-2a〜KAT-5`
- Light Layers仕様のR2〜R6 = `ART-2〜ART-6`

## 4. 現在地 — 二軸状態

状態は必ず`Implementation`と`Acceptance`を分ける。

| Stage | Implementation | Acceptance | commit／根拠 | 次の判定 |
|---|---|---|---|---|
| OPT-0.5 | コード完了 | GO | `f81e03d` | accepted baseline |
| OPT-1a | コード完了 | GO | `a4f804f3` | accepted baseline |
| OPT-1b | コード完了 | GO | `23ebcb3f` | 現在の安定baseline |
| OPT-1c | コード完了 | **未検証／HOLD** | `e5c67e4` | Evidence Manifest実行 |
| OPT-1d | 未着手 | 未検証 | — | OPT-1c GO待ち |
| KAT-1 | 未着手 | 未検証 | 設計`5516a97` | OPT-1d GO後 |
| OPT-1e | 未着手 | 未検証 | — | KAT-1 GO後 |
| KAT-2a | 未着手 | 未検証 | 承認済み計画 | SSOT-0 GO後に準備可能 |
| GLOW-A0 | 設計本文完成 | **Draft PR収録／review待ち** | `afterglow-design.md` | SSOT-0で受入 |
| GLOW-A1 | 未着手 | 未検証 | — | SSOT-0／GLOW-A0 GO後、clean別worktreeで開始可能 |
| ART-2以降 | 未着手 | 未検証 | — | OPT-1e GOと作者layer選択待ち |

`OPT-1c`はコード上のFAILではないため「総合NO-GO」と呼ばない。実装はコード完了、受入は必要証拠不足によるHOLDである。

### 4.1 Draft公開前のGitHubとの差

- GitHub `main`: `837c19d564e3cd92d0af3fceefa3ea16cae09aef`
- ローカル`agent/integrate-recovered-studies`: `e5c67e4`
- 検証済み実装履歴とAfterglow設計はDraft公開前にはGitHub未掲載

この差を解消するため、§5.1のDraft PR stackを公開する。Draft公開は再現可能性を作るための途中状態であり、`main`へのmergeやSSOT昇格を意味しない。公開後のPR番号、head SHA、base関係はGitHub上のPRを正とする。

## 5. 既存6 commitのstage対応

| commit | 統合ID | 内容 | Acceptance | 推奨PR |
|---|---|---|---|---|
| `f81e03d` | OPT-0.5 | Optical Event Contract実装 | GO | PR-OPT-0.5 |
| `5516a97` | SSOT-0 / KAT設計 | 形態配置計画書 | 文書承認済み | PR-SSOT-0 |
| `a91756a` | SSOT-0 / OPT-1 handoff | 段階実装指示書 | 文書承認済み | PR-SSOT-0 |
| `a4f804f3` | OPT-1a | Contract and Fixed Cases | GO | PR-OPT-1a |
| `23ebcb3f` | OPT-1b | Receiver Observation and Energy Split | GO | PR-OPT-1b |
| `e5c67e4` | OPT-1c | View Reflection／Transmission Observation | HOLD | Draft PR-OPT-1c |

### 5.1 PR戦略

「1 PR = 1 stage」を維持する。現在の直列commitは、source commitとの対応を保ったstacked PRとして提示する。stack構築時のcherry-pickでhead SHAが変わる場合、上表はsource commit、GitHub上の各PR head SHAは公開commitを表す。

```text
PR-OPT-0.5
  -> PR-SSOT-0
  -> PR-OPT-1a
  -> PR-OPT-1b
  -> Draft PR-OPT-1c
```

`PR-SSOT-0`だけは同一governance stageとして、`5516a97`、`a91756a`、master plan、Afterglow設計、README索引、旧Status委譲をまとめられる。OPT-1cはevidenceが揃うまでDraftのままにする。

### 5.2 公開時のmerge gate

最初の公開では5 PRをすべてDraftとし、この順序と条件でのみReady／mergeへ進める。

1. `PR-OPT-0.5`: PR差分、テスト、独立レビューが正常なら最初にmergeできる。stage AcceptanceはGO済み。
2. `PR-SSOT-0`: Natural三状態・4ペア手順の作者承認、master planとR1 handoffの一致、README／旧Status／リンク確認、独立文書レビューGOがすべて揃ってからmergeする。このmergeをmaster planのSSOT昇格点とする。
3. `PR-OPT-1a`: `PR-SSOT-0` merge後のbaseへ追従し、テストと差分レビューを再確認してmergeする。stage AcceptanceはGO済み。
4. `PR-OPT-1b`: `PR-OPT-1a` merge後のbaseへ追従し、テストと差分レビューを再確認してmergeする。stage AcceptanceはGO済み。
5. `Draft PR-OPT-1c`: `<candidate-sha>`のEvidence Manifest全PASS、independent verification PASS、fresh review `ship`、作者のAcceptance GOが揃うまでDraft／HOLDを維持し、mergeしない。

FAILまたは証拠不足では後続PRを使ってgateを迂回せず、該当PRをHOLDにする。

## 6. 正規化した依存表

この表を依存関係の正本候補とする。後段の実行順は説明であり、この表に反してはならない。

| Stage | 前提 | 並行可能 | 完了成果物 | GO条件 | 次stage |
|---|---|---|---|---|---|
| SSOT-0 | 現状調査 | なし | GitHub上のmaster plan、詳細設計、PR stack | §7完了、レビューGO | OPT-1c、準備lane |
| OPT-1c | OPT-1b GO | KAT-2a、GLOW-A1 | View source MRTとevidence一式 | §8の全gate PASS | OPT-1d |
| OPT-1d | OPT-1c GO | KAT-2b/2c、GLOW-A1/A2 | path属性由来internal-reflection表示 | handoffのtest/review GO | KAT-1 |
| KAT-1 | OPT-1d GO | KAT-2b/2c、GLOW-A2 | 全11 Study導線 | catalog一致、solver等不変 | OPT-1e |
| OPT-1e | KAT-1 GO | KAT-2b/2c、GLOW-A2 | flag付きDEBUG LAYERS UI | R1全acceptance、review GO | ART-2、GLOW-A3 |
| KAT-2a | SSOT-0 GO | OPT-1c | Sag fixed fixtures | production差分0、fixture PASS | KAT-2b |
| KAT-2b | KAT-2a GO | OPT-1d〜1e | pair force pure core | Sag数値回帰PASS | KAT-2c |
| KAT-2c | KAT-2b GO | OPT-1d〜1e | Arrangement wrapper | 決定性、停止理由、有限値PASS | KAT-3 |
| GLOW-A0 | SSOT-0内で実施 | なし | Git収録済み設計 | SSOT-0文書review GO | GLOW-A1 |
| GLOW-A1 | SSOT-0 GO、GLOW-A0 GO、clean別worktree | OPT-1c〜1e | trajectory contract／CPU store | allocation・fps相当test PASS | GLOW-A2 |
| GLOW-A2 | GLOW-A1 GO | OPT-1d〜1e | 独立emission／feedback／bloom harness | decay、reset、resource test PASS | GLOW-A3待機 |
| OPT-LD-1 | SSOT-0 GO | OPT-1、KAT-2 | authored deformation on/off固定case | `light-drawing.md` LD1 gate PASS | OPT-LD-2 |
| OPT-LD-2 | OPT-LD-1 GO | OPT-1、KAT-2 | 0.53°／5°／20°相当の光源サイズ比較 | 同じtraceが単調にsoftenし、transmissionが比較可能 | OPT-LD-3 |
| OPT-LD-3 | OPT-LD-2 GO | OPT-1、KAT-2 | authored deformation移動比較 | receiver lineが連続的に移動 | OPT-LD-4 |
| OPT-LD-4 | OPT-LD-3 GO | OPT-1、KAT-2 | receiver近／中／遠比較 | 固定world座標で位置・spread変化を記録 | OPT-LD-5 |
| OPT-LD-5 | OPT-LD-4 GO | OPT-1、ART-2〜5 | Blender／選択実作比較 | arc／cuspの存在、方向、sharp／soft傾向が整合 | 条件付きART-6 gate完了 |
| ART-2 | OPT-1e GO、作者が1〜2層選択 | KAT-3/4、OPT-LD | PHENOMENON prototype | 因果表示とArt/Physical分離 | ART-3 |
| GLOW-A3 | **OPT-1e GO**、GLOW-A2 GO | ART-2 | `?afterglow=1`最小統合 | flag-off不変、併用回帰PASS | GLOW-A4 |
| GLOW-A4 | GLOW-A3 GO | ART-2〜4 | Compatible／Standard／RTX 3080 High固定profile | `afterglow-design.md`の性能・memory・停止条件PASS | GLOW-A5 |
| GLOW-A5 | GLOW-A4 GO | ART-2〜4 | 既存trailsとの作者比較記録 | 運動が読める、白く潰れない、複雑性に見合う | 通常UI候補または実験機能として固定 |
| KAT-3/4 | KAT-2c GO | ART-2/3 | 非破壊preview、採用、保存、取消 | 正本・旧保存互換 | KAT-5 |
| KAT-5 | KAT-4 GO、実制作での配置機能評価 | ART-3〜5 | Sag／MPM／配置調整の入口と役割整理、確認済みrecipe接続 | 二重実装なし、既存MPM入口不変、接続状態表示と回帰PASS | 利用結果に応じて継続判断 |
| ART-3 | ART-2 GO | KAT-3/4、GLOW-A4 | Environment Composite＋Ambient | Clock共有、背景／前景整合 | ART-4 |
| ART-4 | ART-3 GO | GLOW-A4/5 | M4 20分持続profile | 性能・memory gate | ART-5 |
| ART-5 | ART-4 GO | KAT-5 | deterministic PNG sequence | 同frame再現、checkpoint再開 | ART-6 |
| ART-6 | ART-5 GO、条件付きOPT-LD | — | RTX3080 4K master | §9の物理主張条件、Final gate | 本計画のFinal milestone完了 |

### 6.1 クリティカルパス

```text
SSOT-0
  -> OPT-1c
  -> OPT-1d
  -> KAT-1
  -> OPT-1e
  -> ART-2
  -> ART-3
  -> ART-4
  -> ART-5
  -> ART-6
```

### 6.2 並行lane

```text
Preparation lane:
SSOT-0 -> KAT-2a -> KAT-2b -> KAT-2c -> KAT-3/4

Afterglow lane:
SSOT-0 -> GLOW-A0 -> GLOW-A1 -> GLOW-A2
                                  |
                         OPT-1e GO待ち
                                  v
                              GLOW-A3

Physical light-drawing lane:
SSOT-0 -> OPT-LD-1 -> OPT-LD-2 -> OPT-LD-3 -> OPT-LD-4 -> OPT-LD-5
```

## 7. SSOT-0 完了条件

SSOT-0は新しいproduction機能を含まないgovernance stageである。

1. 本レビューのblocking concernがmaster planへ反映されている。
2. 本書を`docs/hikari/master-plan.md`へ収録する。
3. `afterglow-design.md`をGit管理へ収録する。
4. `docs/hikari/README.md`最上段からmaster planへリンクする。
5. `r05-optical-event-contract-handoff.md`等の古いStatusを更新するか、`Current status is delegated to master-plan.md`と明記する。
6. §5のcommit-stage mapとstacked PR境界をGitHubから確認できる。
7. accepted baseline `23ebcb3f`とcandidate `e5c67e4`を区別する。
8. OPT-1c Evidence Manifestの空テンプレートを収録する。
9. OPT-LDのblocking decisionを§9どおり記録する。
10. README、master plan、handoff間のリンク切れと矛盾を確認する。
11. 独立文書レビューがGOを返す。

これらが完了するまでは、`docs/hikari/master-plan.md`を最上位SSOTとして運用開始しない。

## 8. OPT-1c Evidence Manifest

### 8.0 判定値の根拠

本節のM4 MacBook Air 16 GB、WebGL capability、target layout、pixel閾値、性能閾値、縮小順、R1中のHikari `v0.32.1`維持は、master planで新しく決めた値ではない。詳細SSOT候補である
`docs/hikari/r1-optical-observation-implementation-handoff.md`の§3、§18.5〜18.8、§22.1〜22.3、§23〜24を転記したものである。

Primary／independent／fresh review／作者受入の分離は、同handoffの段階別review契約と、OPT-1a／1bで採用済みの受入手順を本stageへ適用したものである。

- 数値または判定手順を変更する場合、先に詳細handoffを改訂し、作者承認を得る。
- master plan側だけで閾値を変更しない。
- SSOT-0では、本節が詳細handoffと一致することを独立文書レビューで確認する。

参照handoffはcommit `a91756a`の次のpathに存在する。

```text
docs/hikari/r1-optical-observation-implementation-handoff.md
Git blob: 9480d12d08643ebdfa68cf781f8ec488a3603b43
```

現在確認中のKatachi checkoutにこのpathがない場合、本節は照合不能であり独立文書レビューをGOにしない。`PR-SSOT-0`は少なくともcommit `a91756a`の同pathを含み、master planと同じPR stackから参照可能にする。handoffを意図的に改訂した場合はblob SHAを更新し、次の対応表を再照合する。

| master planの値 | 詳細handoffの根拠 |
|---|---|
| Hikari `v0.32.1`維持 | 冒頭Target application、§3 |
| WebGL2／float extension／draw buffers／attachments／FBO | §18.5 |
| 最大channel差、different pixel ratio、固定capture | §18.6 |
| 3分性能閾値と固定縮小順 | §18.7 |
| M4 MacBook Air 16 GB、測定順、warm-up | §22.2 |
| R1全体のacceptanceとrollback | §23〜24 |

### 8.1 判定責任

1. **Primary verifier**が同一release buildと固定caseで証拠を取得する。
2. **Independent verifier**がmanifest、画像、数値、commit、tree、clean statusを読み取り専用で照合する。
3. **Fresh Sol reviewer**がactual diffと全証拠から`ship`または`revise`を返す。
4. **作者**が全gate PASSとreview `ship`を確認してAcceptanceをGOにする。

一つでも欠ける場合、Implementationはコード完了のまま、AcceptanceはHOLDとする。

### 8.2 保存先と命名

```text
docs/hikari/evidence/opt-1c/<candidate-sha>/<YYYYMMDD-HHMM>-m4mba/
  manifest.json
  environment.json
  gl-capability.json
  target-layout.json
  natural-safe0-baseline.png
  natural-safe0-candidate-absent.png
  natural-safe0-candidate-on.png
  natural-safe1-baseline.png
  natural-safe1-candidate-absent.png
  natural-safe1-candidate-on.png
  diagnostic-front.png
  diagnostic-grazing.png
  diagnostic-tir.png
  diagnostic-nested.png
  pixel-comparison.json
  performance.json
  tests.txt
  review.md
```

画像にはcase ID、commit、safe値、flag、viewport、DPRをmanifestで対応付ける。生成物をcommitへ入れない場合も、同じ構造のartifact archiveとSHA-256を`manifest.json`へ記録する。

`<candidate-sha>`は測定対象の完全なcommit SHAである。OPT-1c stage内の限定修正によって新commitが生じた場合、旧candidateと旧evidenceは`superseded`として保持し、新candidate SHAで全証拠を最初から取得する。異なるcandidate間の証拠を混ぜない。

Natural比較で使う三状態を次に固定する。

- `baseline`: accepted parent `23ebcb3f`のrelease build。OPT-1cコード自体が存在しない。
- `candidate-absent`: `<candidate-sha>`のrelease buildで、R1c constructor optionを渡さずpassをinstantiateしない。
- `candidate-on`: 同じ`<candidate-sha>`でR1c observationを有効化する。

`flag-off`という別名は使わない。明示的な`false`とoption absentが内部実装上同じ経路でも、artifact名と判定は`candidate-absent`へ統一する。

この三状態と§8.5の4比較ペアは、詳細handoffの「safe=0／1、debugLayersなし／あり」を機械判定可能にするための**SSOT-0提案手順**である。詳細handoffに比較ペアまでは明記されていないため、SSOT昇格前に作者承認を得る。承認されるまでEvidence Manifestの手順はHOLDとする。

### 8.3 固定環境

- M4 MacBook Air、16 GB
- release build
- 同一window、case、seed、viewport、DPR
- browser/build/versionを記録
- AC／battery、thermal条件を記録
- baseline、candidate-absent、candidate-on static、candidate-on motion/videoを同じ順序で測る
- 60秒warm-up後、3分採取

### 8.4 Capability／target gate

Primary M4環境の期待結果:

- WebGL2: true
- `EXT_color_buffer_float`: available
- `MAX_DRAW_BUFFERS >= 2`
- `MAX_COLOR_ATTACHMENTS >= 2`
- `RGBA16F × 2` framebuffer: complete
- target: 2 attachments、HalfFloat、Nearest、no mipmap、no depth、no stencil、no MSAA
- scale: 0.5、最大1280×720
- 1280×720時の2 attachments見積り: 14,745,600 bytes

別環境で不足する場合は、理由付き`unsupported`となり、RGBA8、packing、複数traceへfallbackせずNaturalが通常動作することをPASS条件とする。Primary M4でsource MRTを取得できなければOPT-1cはGOにしない。

### 8.5 Natural pixel gate

同じcase、viewport、DPRで、比較ペアを次に固定する。

1. `safe=0`: `baseline` 対 `candidate-absent`
2. `safe=1`: `baseline` 対 `candidate-absent`
3. `safe=0`: `candidate-absent` 対 `candidate-on`
4. `safe=1`: `candidate-absent` 対 `candidate-on`

各ペアで次を満たす。

- 最大channel差 `<= 1/255`
- different pixel ratio `<= 0.001`
- Natural canvas寸法、背景、interactionが一致
- candidate-absent時は追加target、shader compile、render passが0
- browser console errorが0

閾値を後から緩めない。上記4ペアの一つでも超過した場合はFAIL。

### 8.6 Diagnostic capture gate

- front: reflection／transmissionが有限・非負でpath codeが契約どおり
- grazing: Fresnel傾向がfrontと区別できる
- TIR: transmitted-after-one-internal-reflectionの固定codeを確認
- nested: unresolved fallback code 4であり、内部反射成功へ偽装しない
- no BODY hit: 両attachmentが0
- captureにNaN、Infinity、負輝度、上下反転、寸法不一致がない

captureは美しさのacceptanceではなく、分類とsource取得の証拠とする。

### 8.7 Performance gate

- feature absent: median GPU frame time増加 `<= max(0.2 ms, 2%)`
- feature on、static idle: median frame time増加 `<= 5%`
- motion/video、10 Hz diagnostic: displayed Natural `>= 30 fps`
- consecutive `> 50 ms` frameが2回以上続かない
- target countとrenderer memoryがresizeを跨いで単調増加しない

不達時の固定縮小順:

1. 10 Hz → 5 Hz
2. scale 0.5 → 0.35
3. cap 1280×720 → 960×540

source削除、RGBA8化、Beauty式変更、閾値緩和は禁止。縮小した場合は最終固定値で全gateを再実行する。

### 8.8 自動gate

- `npm run test:hikari`
- R0.5固定10ケース
- TypeScript test typecheck
- production build
- `git diff --check`
- Hikari version gate、v0.32.1
- GPU payload v1、28 floats、offset不変
- Natural Beauty式のsource-contract不変
- worktree clean

### 8.9 機械的な受入判定

- 全項目PASS + independent verification PASS + fresh review `ship` + 作者受入: **Acceptance GO**
- 数値または回帰FAIL: **Acceptance FAIL**。OPT-1c stage内の限定修正後、新candidate SHAで全証拠を取り直す。
- 実機測定不能／証拠欠落: **Acceptance HOLD**。baselineは`23ebcb3f`を維持する。
- FAILを後続OPT-1dで覆い隠さない。

## 9. OPT-LD blocking decision

### 9.1 決定

**OPT-LDはART-2の普遍的blockerにはしない。ART-6では作品の主張に応じた条件付きgateにする。**

- ART-2／3は、Optical Observationを物理sourceとして正しく表示し、Art処理を明示する限りOPT-LD未完でも開始できる。
- GLOWや一般的なPHENOMENONを「物理的な光の筆跡」と呼ばない。
- receiver上の線を「作者の形状が物理的に生んだLight Drawing」として作品の中心に据える場合、ART-6前にOPT-LD gateが必要。
- ART-6が別のView／Receiver現象やAfterglowを中心にする場合、OPT-LDは別研究成果として継続できる。

### 9.2 ART-6前の条件付きOPT-LD gate

物理的Light Drawingを作品主題に含める場合、少なくとも次をGOにする。

**正規依存表のOPT-LD-1〜OPT-LD-5すべてをGOにすることがART-6の条件である。**

1. LD1: 保存されたmid-scale authored deformationのon/offで、一つのline／arcが出現または予測可能に移動する。
2. LD2: 同じ形を0.53°／5°／20°相当の光源サイズで比較し、同じtraceが単調にsoftenする。
3. LD3: authored deformationの小移動にreceiver lineが連続応答する。
4. LD4: receiverの近／中／遠で、同じtraceの位置とspread変化を固定world座標で記録する。
5. LD5: Blenderと選択実作写真が、線の存在、方向、sharp／soft傾向で整合する。
6. v0.29.4のexpressive redistributionを物理証拠に使わない。

gate未完の状態でreceiver Art layerを使う場合、UI／作品資料に`expressive / unverified physical light drawing`と明記する。

## 10. GLOW接続条件

GLOW-A3は文書全体で**OPT-1e GO後**に統一する。

- GLOW-A1／A2は新規`afterglow/` moduleと専用test／harnessだけで先行可能。
- A1／A2ではproduction runtimeへimportしない。
- A3は`?afterglow=1`の最小hookだけを、新しいOPT-1e accepted baselineから追加する。
- flag offでtarget、shader compile、animation update、listenerを0にする。
- `?afterglow=1&debugLayers=1`の併用回帰を必須にする。
- OPT-LD、Natural、receiver、ledger、28-float payload、`.hkr`へ混ぜない。

## 11. Observation Clock契約

ClockはART-5で突然導入せず、ART-2から同じinterfaceを使う。

```ts
type ObservationClock = {
  timeSeconds: number;
  deltaSeconds: number;
  frameIndex: number | null;
  mode: "realtime" | "fixed-frame";
};
```

### ART-2

- `realtime` adapterを使用する。
- Flow、形の回転、Art temporal処理が同じclockを読む。
- fps低下で効果時間が変わらないよう秒ベースで評価する。
- `frameIndex`はnullでよい。

### ART-3

- 背景動画、前景形状、Ambient stateが同じ`timeSeconds`を読む。
- pause／holdの意味をclock操作として固定する。

### ART-5

- 同じinterfaceへ`fixed-frame` adapterを追加する。
- `timeSeconds = frameIndex / fps`で決定する。
- checkpoint、停止、再開、asset hash、同frame再現を実装する。

この構造により、ART-2の時間表現を作り直さずART-5の決定論的連番へ移行できる。

## 12. 矛盾のない実行順

### Phase 0 — SSOT成立

1. 本書をレビューし、GLOW-A0としてAfterglow設計をレビュー・Git収録する。
2. §5のstacked PRを用意する。
3. READMEと旧Statusの委譲を更新する。
4. OPT-1c evidence templateを収録する。
5. 独立文書レビューGO後、master planをSSOTへ昇格する。

### Phase 1 — OPT-1cと準備lane

直列:

1. OPT-1cの`<candidate-sha>`について証拠だけを取得・判定する。初期candidateは`e5c67e4`である。
2. PASSなら測定した`<candidate-sha>`を受け入れる。
3. FAILならOPT-1c stage内で限定修正して新candidateを作り、測定不能なら`23ebcb3f`を維持する。

SSOT-0 GO後に並行可能:

- KAT-2a: Sag固定fixture
- GLOW-A1: trajectory contract／CPU store

### Phase 2 — Optical UI critical path

1. OPT-1d
2. KAT-1
3. OPT-1e

同時にKAT-2b／2cとGLOW-A2を、renderer、UI、Natural未接続で進められる。

### Phase 3 — 作品prototype

1. OPT-1e観測結果から作者が1〜2層を選ぶ。
2. OPT-LDの条件付きdecisionを作品案へ適用する。
3. ART-2でrealtime Observation ClockとPHENOMENONを作る。
4. GLOWを使う場合だけGLOW-A3を独立flagで接続する。

### Phase 4 — 制作系とFinal

- KAT-3／4は作品v1を止めずに進める。
- ART-3: Environment Composite＋Ambient
- ART-4: M4 20分持続
- ART-5: fixed-frame Clock、1080p連番、checkpoint
- ART-6: RTX3080 4K Final。物理Light Drawingを主張する場合は§9 gate必須

## 13. SSOT構成

| 領域 | 詳細SSOT |
|---|---|
| 統合状態・依存・優先順位 | `docs/hikari/master-plan.md` |
| OPT-0.5 | `r05-optical-event-contract-handoff.md` |
| OPT-1 | `r1-optical-observation-implementation-handoff.md` |
| ART | `light-layers-art-render-spec.md` |
| KAT | `katachi-assisted-arrangement-plan.md` |
| OPT-LD | `light-drawing.md` |
| GLOW | `afterglow-design.md` |
| 作品コンセプト・公募 | `artwork-strategy.md` |
| Study ID／名称／URL | `src/lib/studies.ts`の`STUDY_CATALOG` |

`current-week-plan.md`は履歴スナップショットであり、現在状態を決めない。Codex taskの最終回答だけを進捗SSOTにしない。

## 14. 直近milestone

最初の統合milestoneは次をすべて満たした時点でGOとする。

- SSOT-0がレビューGOになり、GitHubからmaster planと詳細文書を辿れる。
- OPT-0.5、OPT-1a、OPT-1bがaccepted PR／commitとして追跡できる。
- OPT-1cがEvidence ManifestによりGO、FAIL、HOLDのいずれかへ一意に確定している。
- KAT-2a fixtureが固定される。
- GLOW-A0がGit管理され、GLOW-A1がproduction未接続で検証可能になる。
- OPT-LDとGLOWが名称、data、UI、acceptanceで混同されない。
- 次に開始可能なstageが正規依存表から一意に求められる。
