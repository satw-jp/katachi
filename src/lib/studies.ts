// ---------------------------------------------------------------------------
// Study catalog (R5-1).
//
// 表示用の小さなデータモジュール。Study 本体は統合しない。
//
// 正本の所在:
//   - id / titleJa / titleEn / status …… 各 `src/studies/<id>/manifest.json`
//   - principle ……………………………………… 各 Study README の "## Question"
//   - href ………………………………………… repo root の実 HTML entry
// ここはその写像であって、正本ではない。`src/lib/studies.test.ts` が
// ファイルシステムを実際に読んで一致を検査する。
//
// version / updatedAt は**意図的に持たない**。手で写すと manifest と別の
// 二重正本になり必ず drift するため（指示書 §3）。表示が要るようになったら
// build 時に manifest から読むこと。
// ---------------------------------------------------------------------------

export interface StudyCatalogEntry {
  /** `src/studies/<id>/` のディレクトリ名。manifest.json の `id` と一致する。 */
  id: string;
  /** repo root の実 HTML entry。cloud-sculpt だけ `index.html`。 */
  href: string;
  titleJa: string;
  titleEn: string;
  /** その Study の README「Question」を一行に構造化したもの。宣伝文にしない。 */
  principle: string;
  /** 既存研究の流れの順。下の注記を読むこと。 */
  researchOrder: number;
  /** 表示補助のタグのみ。filter UI はまだ無い。 */
  purposeTags: readonly string[];
  status: "active" | "paused";
}

// researchOrder は既存の研究の流れ（どの問いの後に、どの問いが立ったか）の順で
// あって、統合順・優劣・完成度・推奨度のいずれも意味しない。
// 1 が「入門」でも 9 が「最新の到達点」でもない。
export const STUDY_CATALOG: readonly StudyCatalogEntry[] = [
  {
    id: "cloud-sculpt",
    href: "index.html",
    titleJa: "雲をこねる",
    titleEn: "Cloud Sculpt",
    principle:
      "球のリストを smooth-min で合成した場を手でこねる。いつ雲に見え始め、いつただの塊に堕ちるかを見る。",
    researchOrder: 1,
    purposeTags: ["場"],
    status: "active",
  },
  {
    id: "gravity",
    href: "gravity.html",
    titleJa: "重力を入れる",
    titleEn: "Gravity",
    principle:
      "質量の流れ ÷ 断面積という粗い力の素描を場に重ね、こねたときの手応えの向きが合うかを見る（FEM ではない）。",
    researchOrder: 2,
    purposeTags: ["場", "力"],
    status: "active",
  },
  {
    id: "sag",
    href: "sag.html",
    titleJa: "たわむ",
    titleEn: "Sag",
    principle:
      "柔らかさのつまみ一本で自重に応えさせ、休んでいる形（正本）とたわんだ形（導出物）の差を形の差として見る。",
    researchOrder: 3,
    purposeTags: ["力", "相"],
    status: "active",
  },
  {
    id: "mpm",
    href: "mpm.html",
    titleJa: "本物を混ぜる",
    titleEn: "MPM",
    principle:
      "弾性論と流体力学を形態形成の原理として持ち込み、作者も実装者も入れていない振る舞いが原理の側から立ち上がるかを見る。",
    researchOrder: 4,
    purposeTags: ["場", "力", "相"],
    status: "active",
  },
  {
    id: "foam",
    href: "foam.html",
    titleJa: "泡のセル",
    titleEn: "Foam Cells",
    principle:
      "同じ球のリストをセルに分解し、穴を第一級の造形要素として、体積のある殻から中身のない糸まで一本のつまみで渡れるかを見る。",
    researchOrder: 5,
    purposeTags: ["セル", "分割"],
    status: "active",
  },
  {
    id: "rings",
    href: "rings.html",
    titleJa: "輪の手",
    titleEn: "Ring Hand",
    principle:
      "球の上に輪という単位の階層を足し、単位を掴む手と、いま何の絡みができているかを道具が正直に言えるかを見る。",
    researchOrder: 6,
    purposeTags: ["場", "単位"],
    status: "active",
  },
  {
    id: "pack",
    href: "pack.html",
    titleJa: "虚を詰める",
    titleEn: "Void Packing",
    principle:
      "実体の内部へ虚を貪欲に詰めて滑らかに減算し、殻・膜と柱・骨組みへの遷移がパッキングの帰結として現れるかを見る。",
    researchOrder: 7,
    purposeTags: ["内部", "単位"],
    status: "active",
  },
  {
    id: "skin",
    href: "skin.html",
    titleJa: "表面に詰める",
    titleEn: "Surface Patch Packing",
    principle:
      "形態の表面を不定形の閉パッチ（コイン／リング）で詰め、実と虚（プレートと窓）の反転を往復できるかを見る。",
    researchOrder: 8,
    purposeTags: ["表面", "単位"],
    status: "active",
  },
  {
    // 既知の metadata drift: この Study の manifest.json の `title` には
    // 一時的な作業状態の接尾辞（"S2.1 audit-fix — …"）が残っており、README の
    // 記述と一致していない。ここでは恒久的な表示名だけを持つ。
    // manifest 側の修正はこのタスクの範囲外（別タスクで扱う）。
    id: "interior-growth",
    href: "interior-growth.html",
    titleJa: "内部から育つネットワーク",
    titleEn: "Interior Growth",
    principle:
      "host の内部に生成場を置いて unit を下から育て、造形制約の有無による3候補の差を同じ host・同じ seed で読み比べる。",
    researchOrder: 9,
    purposeTags: ["場", "内部", "造形制約"],
    status: "active",
  },
  {
    id: "hitsuji",
    href: "hitsuji.html",
    titleJa: "羊に原理を作用させる",
    titleEn: "Hitsuji Principles",
    principle:
      "作者自身の同じ羊へ、差分成長・相分離・流れに沿う羊毛化を単独で作用させ、元形状の同一性と別形状化の境界を比較する。",
    researchOrder: 10,
    purposeTags: ["比較", "表面", "制作"],
    status: "active",
  },
  {
    id: "tangle",
    href: "tangle.html",
    titleJa: "軌跡を塊にする",
    titleEn: "Trajectory Fusion",
    principle:
      "閉じた軌跡へ太さを与えて接触部を融合し、線を追える複雑さと穴を持つ一塊の境界を見る。",
    researchOrder: 11,
    purposeTags: ["場", "軌跡", "融合"],
    status: "active",
  },
];
