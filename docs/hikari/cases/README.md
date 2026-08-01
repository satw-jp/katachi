# Hikari baseline cases

Phase 0 の比較は、同じ `.hikari-case.json` を開き、HIKARI / Optics / Natural で行う。
case JSON は形状レシピ、全Hikari設定、カメラと注視点、観察メモ、版、互換性・計算バックエンドの記録である。
画像、派生メッシュ、GPUの実行結果は含まない。読み込み時は形式検証後に再生するため、同じcaseでも実行環境により
CPU/WebGPU のbackend記録は変わり得る。

## 固定ケース（Phase 0）

各ケースでは保存済みの shape / camera / Hikari settings を変更せず、次の差だけを比較する。

| case ID | 固定する設定 | 比較の目的 |
| --- | --- | --- |
| `P0-clear-body` | `phenomenon=optics`, `opticalView=natural`, `opticalColorMode=color`, `rainbowModel=prism`, `dispersion=0`, `ior=1.50`, `absorption=0`, `lightAngle=-24`, `sunSize=0.53`, `opticalSampleCount=16384` | 吸収のない透明体で、形／背景歪み／透明影／集光の基準を取る。 |
| `P0-colored-shadow` | 上記と同一shape・cameraで `absorption=2.50`, `causticStrength=1.20` | 現行の単一吸収値と固定tintが作る濃い透明影を保存する。RGB材料が接続済みとは扱わない。 |
| `P0-ior-caustic-low` / `P0-ior-caustic-high` | 同一shape・camera・light、`absorption=0.55`, `dispersion=0` で `ior=1.10` / `ior=1.65` | 屈折率だけで背景歪みと集光の位置・広がりがどう変わるかを見る。 |
| `P0-safe-fallback` | `P0-colored-shadow` と同じ設定を `?safe=1` で開く。`opticalRayCount=56`; `opticalSampleCount` は要求値としてのみ記録 | Windows-safe CPU経路が黒画面にならず、粗い標本数でも透明影を保持するかを見る。 |

共通値は `opticalSeed=sun-01`, `skyIntensity=0.85`, `sunIntensity=1.25`,
`groundReflectance=0.70`, `opticalExposure=1`, `surfaceRoughness=0.08`,
`surfaceVariation=0.04`, `materialVariation=0.18`, `materialScale=1`,
`environmentContrast=1`, `environmentRotation=0`, `environmentMist=0.72`,
`opticalColorMode=color`, `dispersionMode=local`, `stressAmount=0.55`, `polarization=0.45` とする。

実測との比較では、caseの `compatibility`、`backend`、`appVersion`、`commit` を観察ノートとともに残す。
安全モードではCPU 56 rayのように品質設定が異なるため、WebGPUの結果と同列の定量比較には使わない。

## Physical scale の扱い

Phase 1 の `opticalScene.ts` は `PhysicalScale` を導入するが、現在の Hikari runtime には接続していない。
既定の `1 mm / shape-unit` は **`source: "assumed"` の参照換算**であり、作品の実寸や材料測定値ではない。
正しい実寸が不明ならcaseの観察メモへ `physical scale: unknown` と明記し、係数を実測値として解釈しないこと。
メッシュの目標寸法から換算した場合は `derived-from-mesh`、作者が寸法を決めた場合は `author` を使う。
将来、case schemaにPhysicalScaleを接続するまで、これらの値はcase JSONの標準フィールドではない。
