# hikari — artwork and open-call strategy

Status: active research and production strategy
VerifiedAt: 2026-08-01

## 作品コンセプト草稿（作者発言から整理）

人が心地よく過ごすための環境を考えたとき、空の雲や川の流れのように、絶え間なく揺らぎ変わる風景が大切だと考えた。それらを眺める場所のように、人が微細な変化へ意識を向けられる状態をつくりたい。

光をその環境を形づくる一要素として捉え、光を実体化する媒体として透明体の家具やオブジェクトを制作してきた。`hikari`は、その心地よさのもととなる要素をさらに分解し、形が光に何をもたらすかを観察・検証するための道具であり、それ自体が新しい環境をつくる作品でもある。

透明体を観察したときに現れる反射、透過、拡散、屈折、吸収といった現象を取り出す。透明体の内部に入った光は、形の変化や鑑賞者の視点によって、雲や川の流れのように絶えず姿を変える。その表現は、作者がすでに制作している実物から重要だと感じた現象を抽出したものである。

映像では、作者が心地よいと感じて撮影した日常の風景を背景や光環境として用い、その風景が実作をもとに生まれた複数の形へ映り込み、透過し、歪む。形との距離を変えながら周囲を回るだけでも、一つの風景と一つの形の関係を十分に観察できる。形を変えた複数の短い観察を並べることで、一般的なCGの写実性ではなく、作者の風景・実物・視点が連なる作品にする。

光と同じく波として伝わる音は、画面の変化を逐語的に説明せず、光の集中・拡散・不在や時間の移ろいへ緩やかに応答する。明るさだけを絶対的な心地よさとはせず、暗い外形の内部に光が存在するオブジェクトでは、暗闇に包まれる心地よさと、その中で光へ意識が向かう状態も扱う。`hikari`は、光、形、音、暗さによって、人が微細な変化に留まるための新たな環境を提案する。

作品用の強調や効果は使用できるが、自然な光輸送と混同しない。実際の形と光から生まれた現象を起点にし、作品用表示であることを明示して、何を抽出・強調したかを記録する。

## Artistic position

hikari can become both a work and a tool from which works emerge. Its distinct territory is not generic beautiful transparent CG, a lighting controller, or an immersive projection spectacle. It brings four normally separate things into one observable chain:

1. multiple windows divide geographically and temporally specific daylight;
2. a handmade or living transparent form redirects those fragments into shadow and focused-light drawings;
3. the author moves, changes, pauses, and records a discovered state in real time;
4. Ambient sound holds the room's slower memory without illustrating every visual change.

Working sentence:

> hikari is an environmental work in which multiple windows divide the sun, a transparent body delays and redirects those fragments, and sound holds the time that remains in the room.

The software interface, rejected states, saved cases, physical transparent body, room, daylight, and sound may all be exhibited as parts of the same work. The computation is not hidden production infrastructure; it is a score and an archive of attention.

## Four forms from one core

| Form | What the audience encounters | Best use |
|---|---|---|
| Live instrument | orbit, time, windows, form, materials, pause, and saved discoveries | media-art and software-art exhibitions |
| Environmental installation | real or model room, several windows, transparent body, daylight, distributed Ambient sound | light, spatial-design, architecture, and art-and-technology calls |
| Time work | a fixed-camera day or seasonal sequence in which light and sound change at different speeds | online judging, film/screening, documentation |
| Drawing series | plans, sections, receiver irradiance, shadow, focused-light trace, and time annotations | architectural drawing and research exhibitions |

Do not make four unrelated projects. Use the same saved cases, form, room geometry, Tokyo clock, sound-state score, and observation text so each form is evidence for the others.

## Ambient is an environment layer, not background music

hikari and the author's Ambient work should respond loosely to a shared environment rather than map every number one-to-one.

The interface between them stays small:

```ts
type HikariAmbientState = {
  timeState: "morning" | "day" | "evening" | "night";
  apertureFamily: "single" | "pair" | "row" | "field";
  opticalState: "direct" | "focused" | "scattered" | "absent";
  changeEvent?: "form-frozen" | "room-changed" | "day-ended";
};
```

- Time state changes layer activity and event frequency over minutes, not musical genre.
- Window count, proportion, and spacing choose where spectral layers seem to live, not a literal note count.
- Focused or scattered light changes reflection density, diffusion, distance, or reverberation rather than brightness-to-volume.
- A living-shape change becomes a rare structural event. Do not trigger sound for every simulation frame.
- Viewer presence, if sensed later, changes only broad empty/near/dwelling states. The work continues without a viewer.
- Sound may release the next form transition after a long section, but it never makes light flash to a beat.

Silence, distance, and incomplete synchronization are materials. Daylight may disappear while a residual sound layer continues; the night version should not recreate sunlight with LEDs simply to preserve daytime spectacle.

Relevant practices include [Ryoji Ikeda's *spectra*](https://www.ryojiikeda.com/project/spectra/), [Ryoichi Kurokawa](https://ryoichikurokawa.com/bio.html), [UVA with Bernie Krause on *The Great Animal Orchestra*](https://www.uva.co.uk/features/great-animal-orchestra-cartier-foundation), and [Studio Olafur Eliasson](https://olafureliasson.net/studio). They are comparison points, not visual templates.

## Position among related practices

| Practice | Useful comparison | hikari's difference to protect |
|---|---|---|
| [Kohei Nawa](https://www.pacegallery.com/artists/kohei-nawa/) | transparent cells destabilize and multiply visual information | daylight, windows, time, and projected traces are causal parts of the work |
| [Tokujin Yoshioka](https://www.tokujin.com/profile/) | glass, crystal, light, and movement across object/architecture scales | a changing instrument and evidence trail rather than one iconic finished form |
| [James Turrell](https://turrell.utexas.edu/) | an opening frames light and sky as material | several windows become a changing score of proportion, interval, and orientation |
| [Tomás Saraceno / Aerocene](https://studiotomassaraceno.org/aerocene/) | cloud, atmosphere, research, and protocols become one practice | a smaller, testable daylight/transparent-material instrument with explicit limits |
| [Casey Reas](https://reas.com/process) | software rules and variation are themselves works | every rule remains connected to material, room, receiver, and natural light |
| [Random International, *Rain Room*](https://www.random-international.com/rain-room) | custom control systems reorganize body/environment relations | passive, uncontrollable daylight and slow observation rather than instant spectacle |

Three differentiation tests:

1. **Multiple-window composition:** count, proportion, sill height, spacing, and orientation create a daylight score; a window is not only a background image.
2. **Tool as co-author and exhibit:** the rules, rejected states, frozen discovery, and physical result remain in one chain.
3. **The artificial body submits to natural light:** real location and time can complete or withhold the work; weather and absence are not replaced by projection.

## Open-call route

Dates and eligibility change. Recheck every official call immediately before preparing a submission.

### Possible 2026 entrances

| Call | Verified timing | Honest route for hikari |
|---|---|---|
| [Asia Digital Art Award FUKUOKA](https://adaa.jp/en/overview/index.html) | 24 Jun–9 Sep 2026 | only submit if the live work and documentation are complete; unfinished prototypes are not eligible |
| [LIT Lighting Design Awards](https://litawards.com/wp2/wp-content/uploads/2025/12/LIT-Awards-Entry-Guide-2026.pdf) | regular 31 Aug; final 18 Oct 2026 | a realised transparent daylight device or rigorous installation proposal with physical evidence |
| [The Architecture Drawing Prize](https://www.worldarchitecturefestival.com/WAF2026/en/page/the-architecture-drawing-prize) | deadline 11 Sep 2026 | lowest-overhead international entrance: a drawing/time series about multiple windows and redirected daylight |

The Architecture Drawing Prize is the most realistic 2026 target because the project can make a precise proposal before a touring installation exists. Do not distort the optical roadmap to meet ADAA or LIT if the work has not crossed its visual gate.

### Main 2027 targets

| Call | Current official signal | Required maturity |
|---|---|---|
| [Prix Ars Electronica](https://ars.electronica.art/prix/en/faq/) | 2027 entries begin in Jan 2027 | robust live instrument, physical relation, English concept, installation plan, strong film |
| [S+T+ARTS Prize](https://starts.eu/opportunities/starts-prize-2026/) | 2026 call closed; monitor next annual call | demonstrated art/technology/material or architectural collaboration and public relevance |
| [GOOD DESIGN AWARD](https://www.g-mark.org/en/apply/gda/guide/steps/1-application) | 2026 closed; ordinarily a spring application | usable tool/service with a clear author, user, availability, and demonstration scenario |
| [SIGGRAPH Art Gallery](https://s2026.siggraph.org/program/art-gallery/) | 2026 closed; monitor next call | technically legible real-time work, reliable installation, English operation and support plan |
| [ISEA](https://isea-2026.isea-international.org/call-for-proposals/) | 2026 closed; next call unannounced | installation plus a practice-based research argument and reproducible evidence |

Later site-realised routes include the [Japan Space Design Award](https://kukan.design/en/detail-guidelines/), [Japan Sign Design Award](https://sda-award.org/), and [World Architecture Festival](https://www.worldarchitecturefestival.com/WAF2026/en/page/faqs). These need a completed spatial work or a credible architectural collaboration; the software alone is not enough.

## Maturity gates

1. **Optical gate:** host/inclusion, transparent shadow, geometry-derived light drawing, and stable natural view pass comparison against physical and Blender references.
2. **Time gate:** Tokyo time, room, multiple windows, and saved cases form a continuous one-day study.
3. **Sound gate:** Ambient reacts through the four-state contract; the work remains meaningful in silence and in darkness.
4. **Physical gate:** one scaled transparent body and one room/window mock-up demonstrate an observed phenomenon without claims beyond the model.
5. **Exhibition gate:** restart, safe fallback, calibration, transport, equipment, daylight contingency, sound layout, visitor flow, and unattended recovery are documented.

Only Gate 1 is required for a serious drawing/film study. Prix Ars Electronica should target Gates 1–5.

## Shared submission kit

Build one source kit rather than rewriting each application:

- 40-word, 150-word, and 500-word statements in Japanese and English;
- one causal diagram: place/time → windows → transparent body → receiver → sound state;
- 8–12 stills carrying case ID, time, room/window dimensions, material, and version;
- a 90-second jury cut and a 3–5 minute time work;
- screen capture plus a fixed physical camera; neither alone is sufficient;
- room plan/section, window schedule, equipment and sound-channel plan;
- one-page technical method and one-page approximation/limitation record;
- installation, daylight contingency, accessibility, maintenance, shipping, and budget sheets;
- authorship, software, reference-image rights, sound-source provenance, and material provenance.

Avoid calling approximate receiver values illuminance, energy savings, or architectural daylight performance until the units and room transport are calibrated. Artistic concentration and engineering performance are related questions, not interchangeable claims.
