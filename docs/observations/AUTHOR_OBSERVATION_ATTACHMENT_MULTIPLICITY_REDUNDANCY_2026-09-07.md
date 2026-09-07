# Author Observation — Attachment Multiplicity / Redundancy as an Artwork Parameter

Date: 2026-09-07
Owner: Author / Research SOL
Status: AUTHOR OBSERVATION / FUTURE SKIN PARAMETERIZATION INPUT

## Observation

The current USAGI + botanical direction remains visually acceptable after the v3 material-ancestry fix.

Some upper or floating-looking motif groups appear to be supported by only one branch. This can be visually interesting because it creates fragility, suspension, and tension, but it is also physically likely to be weak or breakable.

The desired future system should therefore not hard-code one attachment policy for every work.

Instead, the author should be able to control **attachment multiplicity / structural redundancy** as a creative parameter.

## Desired author-facing concept

A future high-level control may behave roughly like:

```text
FRAGILE / SINGULAR  <-------------------->  REDUNDANT / PRODUCT-ROBUST
       1–2 attachments                          several attachments
```

This is not merely a strength slider.

Changing the requested number of supporting connections should be allowed to alter the generated organization itself:

- the number of branches reaching a motif or motif cluster;
- how branches anastomose / cross-link;
- whether several motifs mutually support one another through a shared local network;
- where motifs are allowed to emerge;
- motif placement / selection when a site cannot satisfy the requested attachment multiplicity;
- local branch order / ancestry;
- local redundancy and alternate load / print paths.

In other words, increasing attachment count should not be implemented as a post-hoc duplication of the same support branch.

## Artwork regimes

The author anticipates different useful regimes.

### Competition / one-off artwork

- one or two attachments may be acceptable or even desirable;
- visual tension / apparent floating quality can be part of the work;
- fragility may be tolerated if understood and intentionally chosen;
- fabrication warnings should remain visible rather than silently overridden.

### Product-art / repeated handling

- several attachments may be required;
- local redundancy and mutual support should increase;
- motif placement may move or be rejected if adequate material ancestry cannot be achieved;
- the network should favor more robust alternate paths without collapsing into a generic engineering truss.

The system should not assume one of these regimes globally.

## Important distinction

Attachment multiplicity has both an **expression role** and a **fabrication role**.

The author should be able to request a low multiplicity for artistic reasons, but the system must expose the resulting durability / printability consequence.

Do not silently increase attachments behind the author's back merely to satisfy fabrication constraints.

Conversely, when a robust regime is selected, the generator should be allowed to change motif placement and branch topology rather than only adding local braces afterward.

## Research / representation implication

Future Research should distinguish at least:

- requested attachment multiplicity;
- achieved material attachment multiplicity;
- number of independent parent branches / paths;
- whether attachments share the same root bottleneck;
- bridge / articulation status in the material graph;
- printable-frontier ancestry of each attachment;
- local geometric / handling durability evidence.

Two visible branches are not necessarily two independent supports if they merge immediately into the same single weak root.

Topology redundancy is not identical to mechanical strength, but it is a useful explicit representation and diagnostic.

## Relationship to current v3 result

The v3 material-ancestry fix connected all 512 motifs into one material body, but some motif / cluster attachments may remain low-multiplicity and physically fragile.

The current visual direction should remain the reference. Do not automatically densify every motif cluster in the current Research fix.

For the immediate printability work, continue to fix printable-frontier ancestry and major failure points while recording attachment multiplicity explicitly.

Future SKIN translation should expose attachment multiplicity / redundancy as a parameter that can influence branch generation and motif placement.

## Relationship to other future author controls

This parameter should coexist with, but remain distinguishable from, the previously recorded:

```text
HOST / SHAPE-LED  <->  ALGORITHM / BOTANICAL-LED
```

A work could therefore be, for example:

- shape-led + fragile / singular;
- botanical-led + fragile / singular;
- shape-led + robust / redundant;
- botanical-led + robust / redundant.

Fabrication constraints such as minimum radius, print causality, and residual Support policy should remain explicit rather than being hidden inside these artistic controls.

No Production implementation is authorized by this observation.