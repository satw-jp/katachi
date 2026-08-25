# SKIN 作者制作工程・引き継ぎレビュー仕様

- Date: 2026-08-26
- Study: skin
- Status: discussion specification / reviewer handoff
- Implementation approval: **not granted**
- Print approval: false
- Repository: /Users/atsushisato/Projects/active/Katachi
- Baseline commit: 8d3df2f8af10f9e2abc33a32e2be49e6adedbc37
- Branch at handoff: agent/hikari-docs-and-publish

## 1. この文書の目的

長くなった制作・印刷準備の会話を、別のCodexタスクが会話履歴なしでレビューできる形へ固定する。
これは右ペイン再編、.fkei、STL Base、Support Paint 1/2、Internal Structure、印刷用サポートの
**作者目線の制作工程仕様**であり、実装指示書ではない。

レビュワーはコードを変更せず、現行実装との矛盾、データ境界、履歴所有権、重い処理の発火点、
段階移行のリスクを指摘する。作者の判断が必要な事項と、実装側で解決すべき事項を分ける。

## 2. 読む順

1. /Users/atsushisato/Projects/active/Katachi/STATEMENT.md
2. /Users/atsushisato/Projects/active/Katachi/RESEARCH.md
3. /Users/atsushisato/Projects/active/Katachi/AGENTS.md
4. /Users/atsushisato/Projects/active/Katachi/src/studies/skin/README.md
5. /Users/atsushisato/Projects/active/Katachi/src/studies/skin/manifest.json
6. この文書

## 3. 現在地

### 作者確認済み

- Case A / Surface 48のBranching印刷用サポートpreviewは、作者が「サポートは機能している」と確認した。
- Support PaintはCase A / Surface 48 / 1 Viewで、連続描画、1 drag = 1 Undo、右Paint Undo、
  Ctrl/Cmd+Z、Paint中の形状Undo無効化まで作者確認済み。
- Branching preview checkpointはbaseline commitへ保存済み。

### 未コミットの現行作業

自動Dry Web基準の復元が未コミットで残っている。主な新規／変更対象は次のとおり。

- src/studies/skin/dryWebRouting.ts
- src/studies/skin/dryWebRouting.test.ts
- src/studies/skin/dryWebPreview.worker.ts
- src/studies/skin/dryWebPreviewWorkerProtocol.ts
- src/studies/skin/main.ts
- src/studies/skin/renderer.ts
- src/studies/skin/README.md
- src/studies/skin/manifest.json
- package.json

result.jsonは既存のユーザー所有差分であり、対象外。次のstashも保持し、変更・削除しない。

- stash@{0}: surface-raycast paint rewrite before persistent surface cache
- stash@{1}: rejected support-paint interaction optimization 2026-08-25

未コミットDry Webは、確定済みsupport-site ledgerから毎回targetを再導出する。

~~~
有効なDry Web target
= 自動inside / body-blocked
+ 青Paintで追加したautomatic outside
- 橙Paintで除外したautomatic inside
~~~

Autoはautomatic classificationへ戻す。object lift、cradle、Internal ColumnsのON/OFFは
Dry Web routing入力ではない。Paint drag中は生成せず、pointerup、Undo/Redo、reset、draft復元後だけ
専用Workerでtargeted graphを更新する。

作者による「ベース内部下側のDry Webが復活した」視覚確認、全SKINテスト再実行、checkpoint commitは未完了。
右ペイン再編をこの差分へ混ぜない。

## 4. 用語の境界

### 作品として残るもの

- Surface Pattern
- Dry Web
- Voronoi Edge
- Internal Columns

これらを合わせて「作品部分」と呼ぶ。Internal Structureは外から見える可能性があり、印刷後も残る。

### 印刷後に外すもの

- Branching support
- Vertical support
- object liftに伴うcradle
- shared foot / raft

これらを「印刷用サポート」と呼ぶ。開発名「Phase A · 支持林 preview」は作者UIから外す。
Internal ColumnsとVertical supportを同じ「Vertical support」と呼ばない。

## 5. 作者目線の制作工程

### A. 作品の表面パターンをつくる

#### 1. ベースのかたち

- 現状のメタボール
- S1レシピ
- STL

STL読み込み技術は既存コードにある。作者側の決定は、三つを同じ工程1のBase入力として扱うこと。
一般STL parser／内外判定はS-mpmにあり、SKINには保存v6 STLの閲覧専用経路があるが、任意STLを
編集可能なSKIN Baseへ接続する統合は未完了。実装側は元STL三角形Surfaceを正として保持し、
source bytes、SHA-256、単位、scale、向き、空間index、Base fingerprintを下流へ渡す。
元STLを作者判断なしにメタボールへ近似して形を変えない。

#### 2. 表面の組み方

既存の表面配置方式、基準面、内側／外側など、ベースに対して形状をどう組むかを扱う。

#### 3. 充填する形状

- 花などの形状選択
- 選択形状の編集
- 「v6スタイルを編集可能データとして作る」プリセット
- 今後追加する形状

4.5や4.5.1の工程番号は使わない。v6は工程3内の編集可能プリセットとする。

#### 4. 表面へ配置して生成

- 「この設定で詰め直す」: 配置データを更新する
- 「この配置からSurfaceを生成」: 現在の配置からmeshを作る
- 編集精度と最終精度を選ぶ

配置の再探索とSurface mesh生成を同じ操作にしない。

### B. 作品の内部構造をつくる

#### 5. 作品表面の角度診断（Internal Structure追加前）

最終精度でSurface単体を診断する。結果は対象Surface fingerprintへ結合し、上流変更後は削除せず
「古い結果」にする。

#### 6. 内部構造の支持方針を塗る（Support Paint 1）

- 青: 作品内部の構造で支える
- 橙: 後で印刷用サポートを付ける
- Auto: 自動判定へ戻す

Paintデータには特定アルゴリズム名を焼き込まず、「内部構造が必要な領域」という作者判断を保存する。

#### 7. 作品内部の構造

初期版は一種類を選択する。

- Dry Web
- Voronoi Edge
- Internal Columns

青領域は選択中の一種類へ渡す。同じPaintを維持したまま方式を切り替え、比較・再生成できる。
将来は複数構造を重ねられるレイヤー方式へ拡張すると面白いが、初期実装では領域を複数レイヤーへ
割り当てない。保存schemaは将来の配列化を妨げない形にする。

#### 8. 作品全体の角度診断

Surface Patternと選択したInternal Structureを合わせた作品meshを再診断し、まだ残る未支持部を確認する。

必要ならSupport Paint 2を使う。

~~~
内部構造で支える → 工程7へ戻して内部構造を編集／再生成 → 工程8で再診断
印刷用サポートで支える → 工程9へ送る
Auto → 作品全体の自動診断へ戻す
~~~

Support Paint 2で内部を選んだ場合は工程9へ直進しない。このループで旧診断は消さず「古い結果」にする。

### C. 印刷のための構造をつくる

#### 9. 印刷用サポート

- Branching support
- Vertical support
- object lift
- cradle
- tip / trunk / branch angle / maximum unsupported length
- shared foot / raft

すべて印刷後に外す構造として扱う。

#### 10. 今の形を印刷確認

- Slice前validation
- 印刷候補の状態確認
- 印刷結果の記録

印刷結果は上書きせず、Print Runごとに失敗、観察、設定、成果物hashを追記する。

## 6. 画面配置の作者決定

~~~
┌─────────────────────────────────────────────────────────────┐
│ PROJECT: 開く | 保存 | Undo | Redo | 3D書き出し            │
├──────────┬──────────────────────────────┬───────────────────┤
│ 左ペイン │        3D Viewport           │ 右: 制作工程A/B/C │
│ 観察操作 │                              │                   │
├──────────┴──────────────────────────────┴───────────────────┤
│ 下: 現在工程・古い結果・診断・選択対象・printApproval       │
└─────────────────────────────────────────────────────────────┘
~~~

### 上部PROJECTペイン

- .fkeiを開く
- 保存／別名保存
- context-aware Undo／Redo
- 3D書き出し: 全部／作品部分のみ／印刷用サポートのみ

Undo／Redoは上部へ移すが、形状履歴とPaint履歴を一つのstackへ混ぜない。現在の操作所有者へroutingし、
「Undo: Support Paint 1の1 drag」のように次に戻る内容を表示する。

### 左ペイン: 観察操作

- 表示対象: 作品だけ／印刷用サポートだけ／全体
- 表示方法: 通常／ゴースト、レイマーチ／ビーズ／段階メッシュ
- CLIP XYZ
- 1 View／4 Views

表示対象は1 View／4 Viewsの全viewportで共通。表示だけを変更し、形状、履歴、診断、書き出し内容を
変更しない。

### 右ペイン: 制作工程

上記A／B／Cの工程を置く。開発者向け診断は通常操作から分離して折りたたむ。

### 下部ペイン: 状態

- 現在工程
- 各成果物の精度とfingerprint一致
- 未開始／編集中／生成済み／作者確認済み／古い結果
- 未完了項目
- 診断件数と選択対象
- printApproval

### 凍結中の実験

「形の流れで分割」は工程から外し、右ペイン最下段の「凍結中の実験」へ移す。既定では計算しない。

## 7. .fkei SKIN Project archive

どの工程でも同じ形式で保存・再開し、読込時に現在工程と古い結果が分かるようにする。

~~~
project.fkei
├─ manifest.json
├─ recipe.json
├─ source/          # S1または元STL。STL Baseなら必須
├─ presets/
├─ placement/
├─ paint/
├─ diagnosis/
├─ internal-structures/
├─ print-support/
├─ meshes/          # 生成済みmeshは任意
└─ print-runs/
~~~

### 正本とcache

- 正本: Base source、Recipe／履歴、配置、Paint、作者設定
- 導出物: 診断、Internal Structure graph、印刷用サポート、mesh
- 生成済みmeshは任意保存。ただしSTLをBaseにした場合の元STLは必ずarchiveへ含める
- 各導出物へ入力fingerprint、解像度、algorithm version、generator commitを記録する
- 読込時に一致しない導出物を削除せず「古い結果」として保持する
- schema versionとmigration経路を持つ

### 3D書き出しの意味

- 全部: 作品部分＋印刷用サポート
- 作品部分のみ: Surface Pattern＋全Internal Structure
- 印刷用サポートのみ: Branching／Vertical＋cradle＋foot／raft

object liftは三つの書き出しで同じ座標契約を使う。画面の表示対象と書き出し選択は独立させる。

## 8. 変更時の状態遷移

上流変更で下流成果物を自動削除しない。依存fingerprintが外れた最初の工程以降を「古い結果」にする。

例:

~~~
充填形状を変更
→ 配置、Surface、診断、Paint再投影、Internal Structure、印刷用サポートが古い結果
→ 旧結果は比較・記録用に残る
~~~

重い生成は自動再試行しない。数秒を超える処理は段階名、進捗または経過時間、cancel、結果要約を表示する。

## 9. 実装前の安全な順序

1. 未コミットDry Web復元をCase A / Surface 48で作者が視覚確認
2. 全SKINテスト、型検査、build、diff check後に独立checkpoint
3. 生成アルゴリズムを変えず、既存controlをA／B／Cへ移すUI shell
4. .fkei project stateとarchive
5. 既存STL parserを工程1の編集可能Baseへ接続
6. Support Paint 2と工程8→7の再診断loop
7. 複数Internal Structure layerは将来拡張

UI再編、Dry Web復元、高精度生成、3MF出力を一つのタスクへ混ぜない。

## 10. レビュワーへの依頼

コードとこの仕様を読み、変更せずに次を報告する。

1. 現行control／state／history／cache／outputのどれが各工程へ対応するか
2. Internal Structureと印刷用サポートがコード上で混線している境界
3. Support Paint 1/2、context-aware Undo／Redo、古い結果保持で破壊しやすい互換性
4. .fkeiへ必ず保存すべき正本と、任意cacheにすべき導出物
5. STL Base統合で既存実装を再利用できる範囲と、SKIN固有の不足
6. P0／P1／P2に分けたリスク
7. 一回30分程度で作者確認地点へ届く、小さな実装タスクへの分割案

作者判断を新たに発明しない。必要な質問は、作品の意味または不可逆な互換性を変えるものだけに絞る。
ファイル変更、commit、生成、Slice、deployは行わない。
