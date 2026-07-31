# hikari — reference corpus

Status: active collection guide
UpdatedAt: 2026-08-01

## Why collect it

The author's favorite Blender work and physical resin work are useful inputs because they make visual preference and material observations discussable. They are not treated as images for hikari to copy. They show which viewpoint-dependent changes, interior relationships, shadows, distortions, and degrees of finish are worth pursuing.

The corpus has three roles:

1. **Preference atlas:** examples the author likes, with a short note explaining why.
2. **Phenomenon reference:** evidence of a specific transparent-material behavior.
3. **Validation case:** a reproducible setup used to compare hikari, Blender, and physical work.

An item may begin as a preference reference and later become a validation case. Do not require full scientific metadata before saving something interesting.

## The useful unit is a case, not a loose image

A mature case connects as many of these as are available:

```text
author note: what is interesting and where it appears
  ├─ physical: original photo set or short orbit video
  ├─ Blender: .blend source, render, and recorded settings
  └─ hikari: case.json, recipe, saved view, and capture
```

The connection matters more than quantity. A small set of well-described cases is more useful than a large unlabelled image folder.

## Minimum record

Every collected item receives:

- stable case ID and title;
- role: `preference`, `phenomenon`, or `validation`;
- one or two sentences answering **what do I like or want to understand?**;
- phenomenon tags such as `view-change`, `colored-host`, `clear-inclusion`, `absorption`, `shadow`, `focused-light`, `distortion`, `surface-finish`, or `shape-change`;
- source type and original filename;
- creator/source, usage permission, and whether it may be committed or published;
- capture or render date when known;
- SHA-256 for source files used in validation;
- relationships to another physical, Blender, or hikari item.

Unknown values stay `unknown`; do not guess them.

## Physical resin record

Keep the untouched original and make separate analysis images. Record what is practical:

- object dimensions, resin/product, pigment or ink, clear/colored region, and surface finish;
- camera/phone, lens or equivalent focal length, exposure, white balance, and whether processing was applied;
- light count, approximate direction, size/distance, environment, background, and receiving surface;
- camera/object positions or an approximate diagram;
- what changed between images.

Because hikari's value is movement, prefer a short orbit video or a small angle series over one hero photograph when possible. A front, three-quarter, side, and back view is already useful. Keep lighting and exposure fixed through the series.

## Blender record

Keep the source `.blend` when it is yours and record:

- Blender version, renderer, device, samples, bounces, and denoising;
- units, object dimensions/transforms, camera, lights, and world;
- material nodes and volume/absorption values;
- color management, exposure, compositor, and relevant render-layer settings;
- the rendered frame and a short note separating material behavior from deliberate image finishing.

A favorite Blender image without its source still belongs in the preference atlas. It simply cannot become a reproducible validation baseline until the missing setup is recovered.

## hikari record

Use the case bundle from the [Blender validation protocol](blender-validation.md). In addition to the optical settings, save:

- the viewpoint that first made the state interesting;
- one nearby viewpoint or small variation that changes the reading;
- the source-shape revision and inclusion transform;
- the author note and phenomenon tags;
- the Git commit, renderer backend, and known approximation.

## Starter set: 8–12 cases

Begin with a deliberately small set:

- 2–3 favorite physical works, including at least one view series;
- 2–3 favorite Blender scenes or renders, with source data where available;
- 2 colored-host/clear-inclusion examples;
- 1–2 shadow or focused-light examples;
- 1 case where a small shape change matters;
- 1 ambiguous or unsuccessful example that clarifies what hikari should avoid.

Overlap is expected: one case may satisfy several slots. After reviewing the first set, collect to answer specific gaps rather than growing the library indiscriminately.

## Storage and GitHub policy

GitHub is the source of truth for the manifest, author notes, case specifications, selected publishable reference images, and hashes. Do not add large `.blend` files, raw photo libraries, or unpublished artwork to ordinary Git history by default.

For each external original, the repository stores its stable case ID, filename, hash, access location, permission, and a small approved derivative when appropriate. If large binaries later need versioning, choose Git LFS or an external object store as an explicit repository decision first.

## Review questions

1. What changes as the viewpoint moves?
2. Which small shape or host/inclusion change alters the reading?
3. Is the interesting effect caused by material transport, surface finish, lighting, composition, or post-processing?
4. Can hikari make the discovery quick and enjoyable even if Blender remains the finishing tool?
5. What could be carried into a physical work, and what remains a renderer-specific artifact?
