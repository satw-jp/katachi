# 実装構成とデータ保護

## 起動順

```text
MINIA_LOWER50_BOOTSTRAP.py
  MINIA_INTERVAL_DELETE_BOOTSTRAP.py
    MINIA_COLOR_UPDATE_FIXED_BOOTSTRAP.py
      MINIA_SINGLE_VIEW_BOOTSTRAP.py
        MINIA_QUAD_EDITOR_BOOTSTRAP.py
          color_author_runtime/author_scoring_runtime.py
          selected_point_runtime/selected_point_overlay.py
          quad_view_runtime/quad_view_adapter.py
        view_clip_runtime/single_view_clip_adapter.py
      view_clip_runtime/guarded_points_runtime.py
    interval_delete_runtime/interval_delete.py (+ hooks)
  interval_delete_runtime/flower_reroute.py
```

`sys.path`の登録順と同名moduleの存在に意味があります。color_author、color_depth、color_path_midpointに同名ファイルがあっても単純に統合・削除しないでください。過去のbootstrapもそれぞれの版を再現するため保存しています。

bootstrapはBlenderのclass、keymap、描画handler、load_postを登録します。保存した.blendのデータだけではPythonの実行状態を完全には復元できないため、対応したbootstrapで起動します。現在のsingle-view adapterは保存済みビューを保持し、初期化時にnative clip状態を一旦解除して再適用します。

## 主な責務

| モジュール群 | 責務 |
|---|---|
| color_path_runtime | グラフcache・支持距離・合流補正・色 |
| midpoint_runtime | 元枝／追加枝の途中点、root registry、整合性確認、グラフ再構築 |
| author_scoring_runtime | Author追加枝も含む色評価 |
| depth_runtime | 色表示・奥行き濃淡。quad系では濃淡停止 |
| selected_point_overlay | 選択点の見やすい表示 |
| quad_view_adapter | 4ビュー対応の選択・表示・操作context |
| single_view_clip_adapter | 各軸／共有／傾斜clip、1↔4画面 |
| guarded_points_runtime | Fは仮線、色更新時に10mm分割する保護付き処理 |
| interval_delete + hooks | 削除maskを選択・表示・graph・scanへ反映 |
| flower_reroute | 花接続の検証済み置換経路を登録・保護 |
| optimizer / flower_support / straight_audit | 候補探索／花の局所独立経路／連続直線監査 |
| dashboard.ps1 / run.ps1 / stop.ps1 | GUI／排他実行・別プロセス検証／停止要求 |

## 出所とID

主編集objectは `AUTHOR_EDIT_ALL • protected point baseline`。元の9,421枝record、18,842端点anchorと7参照を保護します。元データを直接書き換えるのではなく、編集点と追加線、削除maskから有効グラフを構成します。

- 元端点：`branch:START` / `branch:END`
- 元線上の途中点：`SMID:segment_index:t`
- Author線上の途中点：`AMID:root_id:t`
- mesh属性：`anchor_index`, `midpoint_kind`, `midpoint_segment_index`, `midpoint_author_root`, `midpoint_t`, `record_index`, `endpoint_index`
- scene `midpoint_author_root_registry`：Author線の両端、位置、cutを追跡。
- scene `minia_deleted_intervals_v1`：元枝上の弧長区間またはAuthor root上の正規化t区間を削除maskとして記録。
- scene `minia_flower_reroutes_v1`：旧区間maskと置換経路を記録。曲がり・脚長を検証し、両脚を通常削除から保護。
- embedded text `MINIA_SOURCE_LEDGER.zlib.base64`：元record、花4,283個、source→plate変換など。

`scan_state`は面の混入、元点の移動、参照fingerprint、出所不明の点、期待される区間との差を調べます。削除maskと承認されたrerouteはその検査に明示的に反映します。単に検査をOFFにする設計ではありません。

## 単位と外形

評価と制約は原寸mm。host.npzの座標をledger内のscaleとtranslationでplate座標へ変換します。今回のscaleは約0.7333333333。Blender画面のズームや単位表示だけから長さを推測しません。

hostは閉じた外形mesh。最近傍点・法線から内外と深さを評価し、線に沿った距離サンプルからclearance下限を確認します。既存sourceのレコード／グラフ／hostを別の版と混ぜないことが重要です。hash一覧を復元時に照合します。

## 状態保存と監査

optimizerは入力・設定・hostのhashをcheckpointに結び付け、毎回元入力から採用接続を再生します。RUNのblendと報告を保存し、別プロセスで読み直して元点・参照・採用線・外形・向き・50mmルール・赤の採用履歴を確認します。

この保存記録の `SOURCE_SNAPSHOT.json` は元ファイルとGit保存先の対応・SHA-256を保持します。`ARCHIVE_CHECKS.json` は保存時の構文検査です。ファイルが後で改修されればhashは変わるため、常に対象commitと一緒に使ってください。
