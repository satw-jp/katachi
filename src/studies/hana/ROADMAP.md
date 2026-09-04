# HANA — Long-Term Authoring Roadmap

この文書はHANAの長期的な方向性と設計意図を記録するliving documentです。
README.mdは「現在実装されているHANA」、ROADMAP.mdは「HANAが将来どこへ向かうか」を分担します。

> **注意**: この文書は実装コミットメントではありません。未実装項目をREADMEで実装済みのように記述しないでください。

---

## Core Direction

**HANA is not a flower-specific tool.**
**HANA is a 3D Drawing / Material Authoring Instrument.**

### 基本原則

| | |
|---|---|
| **HANA** | 作者が形を描く |
| **SKIN** | その形を物理的に成立させる |

HANAとSKINは上下関係ではなくpeer関係。

| Input | Role |
|---|---|
| Apple Pencil | Draw / Create |
| Mouse / Touch | Refine / Edit / Camera / Selection |

---

## Authoritative Hierarchy

```
Raw Gesture
    ↓
Control Stroke
    ↓
Smooth Centerline
    ↓
Material Representation
    ↓
Field / SDF
    ↓
Surface Mesh
```

| Layer | Authority |
|---|---|
| Raw Gesture | authoritative input |
| Control Stroke | authoritative editing representation |
| Smooth / Material / Field / Mesh | derived |

- 作者の速度・揺れ・躊躇・不均一さを保持する
- randomnessで「自然さ」を追加しない

---

## Planned Authoring Modes

### A. Stroke Drawing (Current Foundation)

Gesture → 3D Stroke → Material

含む:
- Cross-view Control Point Edit
- Move Gizmo
- World-axis constrained edit

### B. Pressure Thickness

Apple Pencil pressure → Control provenance → Material Sample radius → Field / SDF → Surface

- Base Thickness + Pressure Influenceとして扱う
- 筆圧をRaw Gesture由来の身体情報として保持する

### C. Projection Redraw

既存3D Strokeを別投影から「描き直す」。

**例:**
| View | Redraw | Inherited |
|---|---|---|
| Front | X/Z = new draw | Y |
| Right | Y/Z = new redraw | X |
| Top | X/Y = new redraw | Z |

- normalized arc-length s=0..1で対応
- Redraw = Stroke全体の再造形
- Gizmo = Point単位の微調整
- 役割を明確に分離

### D. Spatial Draw

Axon等で、設計的な断面指定だけでなく空間へ直接描く感覚的な3D Drawingを目指す。

2D pointerだけではdepthが一意でないため、Drawing Context / Work Plane / Surface context等によって3D解釈を与える。

将来的な候補:
- local work plane
- existing surface normal
- tangent plane
- spatial continuation

**現段階では詳細仕様未確定**

### E. Surface Host / Surface Draw

既存形状の表面へApple Pencilで描く。

- Surface DrawはHANA側のauthoring responsibility
- Surface Hostは出自を限定しない:
  - HANA-authored volume
  - SKIN-derived/reference volume
  - imported/reference volume
- HANAから重要なのは「どこから来たSurfaceか」ではなく「描けるHostか」である

**Surface query foundation候補:**
- ray hit
- closest point
- normal
- tangent frame
- local work plane
- offset
- host revision

**Surface Gestureは概念的に:**
- targetHostId
- worldPosition
- normal
- tangent frame / local coordinates
- surface offset

を保持する。

**重要**: Mesh triangle identityをauthoritative attachmentにしない。Meshはderived resultであり、再meshingでtriangle IDが変わってもSurface Gestureを再投影できる設計を目指す。

### F. Surface Pattern

```
Base Volume
    ↓
Surface Draw
    ↓
Pattern / Stroke / Motif
    ↓
Material Geometry
```

- 単なるtexture paintingではなく、表面へ実際のMaterial Geometryを描く
- 当初からの重要目標: Base shape → surface pattern / flower → surface + internal structure → fabrication
- Flowerは将来このSurface Pattern / Motif systemへ接続する

### G. Fiber Cloud / Thread Volume

複数の3D Strokeを糸くず・繊維のように空気を含ませて絡ませる。

- materialだけでなくvoid / airを保持する
- 単純なsolid volume fillにしない

将来的に:
```
surface stroke
    ↓
floating fiber
    ↓
stem
    ↓
internal web
```
が連続し得る。

HANAのFiberとSKINのPermanent Internal Webは、作品表現と支持構造が一致する領域として将来的に接近する可能性がある。

### H. Closed Profile / 3-View Volume

Top / Front / Rightで閉じた輪郭を描く。各silhouetteをview方向へvolume化し、Intersection等で3D volumeを定義する。

**例:**
| View | Extrusion |
|---|---|
| Top | Z |
| Front | Y |
| Right | X |

Intersection → 3方向すべてのsilhouetteを満たすvolume

Mesh Booleanを中心architectureにせず、可能な限りField / SDFへ統合する。

### I. Boolean / Material Field

将来的に:
- Stroke Volume
- Silhouette Volume
- Section Volume
- Fiber
- Motif

をUnified Material Fieldへ集約。

Field levelで: Union / Intersection / Difference / Blend 等を扱う方向。

### J. Section / Profile Volume

3-viewだけでは定義しづらい形状について、任意断面を作者が描く。

複数Section:
```
Section A
Section B
Section C
    ↓
interpolation / loft / field blend
    ↓
volume
```

これはHANAの中でも比較的「設計的」なauthoring mode。Spatial Draw / Surface Draw等の身体的authoringと対立させず併存させる。

### K. Motif Authoring

Flowerをflower-specific featureのまま閉じず、Generic Motifへ発展させる。

候補: Flower / Leaf / Petal / Branch / Seed / Shell / Web fragment / arbitrary hand-drawn motif

Motifは単なるmeshではなく、将来的に:
- Raw Gesture
- Control Geometry
- Material representation
- Field
- Local coordinate frame
- Anchors / connection points
- Semantic role

等を保持可能なauthoring objectとする。SKIN用Motifの制作もHANAの役割に含める。

---

## Recursive / Layered Authoring

長期的に重要な原則:

> **「ある形をHostにして、その上へ次の形を描く」**

```
HANAでBase Volumeを描く
    ↓
そのVolumeをSurface Hostにする
    ↓
Patternを描く
    ↓
Motifを描く
    ↓
Stem/Fiberを伸ばす
    ↓
SKINで成立させる
    ↓
SKIN resultをReference HostとしてHANAへ戻す
    ↓
さらに描く
```

HANAを
“一度形を作って終わるモデラー”
ではなく、
**“描いた形を足場にして、さらに描き続けるInstrument”**
として発展させる。

---

## HANA ↔ SKIN

一方向Exportだけを最終形としない。

### 長期フロー

```
HANA (authoring geometry)
    ↓
SKIN (validation / support / internal web / fabrication)
    ↓
HANA (reference / feedback)
    ↓
作者が修正
    ↓
SKIN (再成立)
```

### Authority Boundary

SKINはHANAのRaw Gesture / Control Strokeを自動改変しない。

SKINからHANAへ返すものは原則:
- validation
- annotations
- reference geometry
- proposed structure
- printable state

必要なら作者がAcceptすることでHANA側のMaterial / Structureへ昇格する。

### SKIN Internal Structureとの接続

将来的には:
```
HANA Fiber / Web
+
SKIN Permanent Internal Web
```
が同一のmaterial structureとして統合される可能性がある。

目標:
> supportだから追加された線
ではなく、
> 作者が描いた線が作品であると同時に支持構造でもある。

---

## Roadmap Phases

| Phase | Focus | Key Milestones |
|---|---|---|
| **Phase 3** — 3D Stroke Authoring | Cross-view Control + Gizmo, Pressure Thickness, Projection Redraw, Spatial Draw foundations | ✅ Cross-view Control + Gizmo, ⏳ Pressure Thickness, Projection Redraw, Spatial Draw |
| **Phase 4** — Surface / Host Authoring | Surface Query Foundation, Surface Draw, Surface Pattern, HANA-authored Host, SKIN/reference Host | |
| **Phase 5** — Open / Volumetric Authoring | Fiber Cloud, Closed Profile, 3-View Volume, Field Boolean, Section / Profile Volume, Mixed authoring modes | |
| **Phase 6** — Motif System | Generic Motif, Flower migration, Anchor / connection semantics, Motif composition | |
| **Phase 6+** — HANA ↔ SKIN Iteration | Semantic Bridge, Validation feedback, Internal Web reference/proposals, Accept / Reject / Edit, Printable State round-trip | |

---

## Current Status (as of 2026-09-05)

### Completed / Fixed Foundation
- Global History / Undo / Redo
- New / Save / Load
- Top command pane
- LOCAL / REMOTE / AUTO Compute
- Cross-view Stroke selection
- Rhino-style Window / Crossing selection
- Deselect
- Cross-view Control Point selection
- Move Gizmo (World-axis constrained)
- Remote Surface rebuild correctness

### Performance Backlog
- LOCAL Surface performance (~9 sec observed) → performance backlog
- REMOTE observed ~1 sec → current hardware observation、保証値ではない

---

## Documentation Policy

| Document | Role |
|---|---|
| README.md | current implemented system |
| ROADMAP.md | future direction / planned architecture / unresolved design space |

- 未実装項目をREADMEで実装済みのように書かない
- ROADMAP.mdはliving documentとして更新し続ける

---

## See Also

See [README.md](./README.md) for current implemented system.