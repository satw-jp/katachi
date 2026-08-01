# hikari — selected-image intake, 2026-08-01

Status: internal visual reference
UpdatedAt: 2026-08-01

## Source and handling

The author first collected 21 selected images in an external local `hikari/Ref` folder: 20 JPEG files and one PNG, about 4.7 MB total. There are no exact image duplicates, subfolders, videos, meshes, source notes, or usable camera EXIF records. The Blender source `study_01_light_size05.blend` was added later and is recorded separately in [Blender study 01](blender-study-01.md).

Creator, work title, source URL, material, dimensions, date, and publication permission are currently unknown. Until the author records rights and provenance, treat every file as a private internal reference. Do not copy the originals into the repository, publish them, or use them as a public-facing baseline.

## Working visual reading

The following are design inferences from the selection, not claims about the author's intent. Confirm or revise them as preference notes are added.

1. **The surrounding room is part of the transparent object.** Windows, shelves, wood, white walls, and other works become visible through reflection and refraction.
2. **Low direct daylight is especially important.** Long shadows, hard window-light regions, warm floors, and bright focused-light patches recur across the set.
3. **The light result can be larger than the body.** Several images give the projected shadow or caustic as much compositional weight as the object.
4. **A range of scale matters.** The selected works show furniture and small-object contexts, but their fabricated size reflects production constraints rather than the intended limit. hikari should extend the same optical question toward sofa and architectural scale.
5. **Receiver material changes the work.** Wood, pale carpet/concrete-like floors, and reflective tabletops each reveal different shadow, color, and reflection behavior.
6. **Optical irregularity is valuable.** Soft asymmetry, thickness variation, haze, bubbles, scratches, and uneven surfaces keep the forms from reading as generic perfect glass.
7. **Color can be dense while an interior stays bright.** Purple/smoke objects and the yellow-green host with a clear central sphere directly support the colored-host/clear-inclusion milestone.
8. **Opaque structure inside or through resin matters.** Metal legs and rods are refracted, obscured, and visually anchored by the transparent body. This is a later inclusion family distinct from clear nested media.

These observations strengthen the decision to prioritize West window, receiver materials, transparent shadow/focused light, placement, and view-dependent exploration.

## Confirmed author preference: light as a drawing

The author identifies the central attraction directly: light runs across the receiver like a scribble. Irregularities left by the author's hand become optical traces, and a change in the light environment makes those traces clear or blurred. The current CG has not yet reproduced this quality.

This confirms R04 (`IMGP5926_trim-1024x680.jpg`) and R06 (`IMGP7769_1280.jpg`) as core light-drawing references. Their purpose is not simply “strong caustics”; it is to preserve the causal relation between handmade curvature/thickness and the projected line.

## Confirmed author preference: abstract receiver variety

The author has found the work compelling on mortar, earth, grassland, acrylic, and flooring. hikari should not reproduce each literal texture. It should expose their underlying light-response differences through abstract parameters, while Blender remains the place to make a concrete scene. This confirms receiver variation as a core optical/context variable rather than final-render decoration.

## Confirmed author intention: a natural-daylighting instrument

Natural light is the primary lighting study. The author wants to vary open air versus a room, which faces are open, room width/depth/ceiling height, window size/position/sill height, the body's distance from an opening, and Tokyo date/time with continuous playback.

This is not only environment styling around an object. The author has been asking whether a transparent body can collect and redirect daylight into a small room with no artificial lighting and behave as a daylighting device. hikari should therefore support thinking about the form and the environment together, including same-exposure body/no-body comparisons that show concentration, redistribution, and loss.

## Confirmed author intention: multiple bodies compose one light field

The author also wants to study the optical relation created by arranging several independent forms. This is supported especially clearly by:

- `L1003046-768x512.jpg`: several chair-like transparent bodies share one broad receiver; their spacing, material differences, long shadows, and local light drawings read as one room-scale composition;
- `L1003163-1536x1024.jpg`: many clear and colored bodies on a reflective surface make foreground/background refraction, depth order, reflection, and partial occlusion inseparable;
- `L1003171-1536x1024.jpg`: a clear foreground body, purple middle body, and dark body form an explicit sequence through which other works and the room are seen;
- `IMGP7769_1280.jpg`: seat and back already behave as separate transparent bodies, sending light to both floor and wall receivers.

The first computational question is a non-intersecting pair: side by side on one receiver, then ordered along the incoming light. It must distinguish a camera overlap from a ray that actually passes through both bodies. Larger Row, Arc, and Field compositions follow only after that two-body transport is stable; see [multiple transparent bodies as a light composition](multi-body-composition.md).

## Initial 12 cases

| ID | Source file | Question for hikari |
|---|---|---|
| R01 | `IMGP5589-1024x680.jpg` | How does a clear furniture-scale body belong to a wood-floor room? |
| R02 | `IMGP5605HDR-1024x681.jpg` | How do thickness and metal legs distort through the seat? |
| R03 | `IMGP5620-1024x680.jpg` | How does a clear back distort a bright outdoor background? |
| R04 | `IMGP5926_trim-1024x680.jpg` | Can the receiver show a curved focused-light pattern separately from shadow? |
| R05 | `IMGP7767_1280.jpg` | How do hard low sunlight, a clear host, and a long cast shadow coexist? |
| R06 | `IMGP7769_1280.jpg` | Can the projected light pattern become a second composition beyond the chair? |
| R07 | `L1003068-1536x1024.jpg` | How does a yellow-green transparent host change the reading of a clear central sphere? |
| R08 | `L1003070-1536x1024.jpg` | How stable is the same host/inclusion relationship at a nearer view? |
| R09 | `L1003073-1536x1024.jpg` | How do related outer shapes change the shadow and furniture reading? |
| R10 | `L1003160-1536x1024.jpg` | How can a dense purple body retain a luminous interior region? |
| R11 | `L1003162-1536x1024.jpg` | How do a clear drop-like form, room reflection, and reflective tabletop interact? |
| R12 | `empty13_comp.png` + `study_01_light_size05.blend` | Can the area-source, purple absorption, and equal-IOR bright-region study be reproduced? |

The remaining images stay linked as alternate views or context for these cases. They are not deletion candidates; same-object views are valuable evidence of viewpoint dependence.

## Information to add gradually

For each selected case, the author can provide only what is known:

- one sentence: what is liked or worth understanding;
- whether the image/work is the author's and whether it may be committed or published;
- work name, dimensions, material/color, and surface finish;
- approximate place, light direction/time, and receiver material;
- for the CG image, renderer and source `.blend` if it still exists.

Unknown fields remain explicit. The first useful next input is the author's one-sentence preference note for R05, R07, R10, and R12; together they cover sunlight, clear inclusion, dense color, and the current CG target.
