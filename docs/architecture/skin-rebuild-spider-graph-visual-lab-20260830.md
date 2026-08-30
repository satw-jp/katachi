# SKIN REBUILD Raw / Clean Spider Graph visual Lab — 2026-08-30

Status: development-only visual comparison. It does not adopt the Cleanup
Candidate into production geometry.

Frozen facts:

- branch: `agent/skin-network-lab`;
- TASK 15 input commit: `20a09098d05ce1bd69243e71db265a3fc06ea553`;
- fixture: `public/samples/skin-rebuild-first-print.fkei`;
- SHA-256: `4bacfcced0fe311eef704a792d61f4a68531051ff408e26d5ff2937b8bbfadcf`.

## 1. Isolation

The comparison is opened locally at `/skin-network-lab.html`. The root HTML
is deliberately absent from `vite.config.ts` production multi-page inputs and
is not linked or imported by `skin-rebuild.html` or
`src/studies/skin/main.ts`. Vite dev can serve the explicit HTML, TypeScript
still checks its module, and automated tests lock this isolation.

The Lab reads the frozen FKEI, validates its SHA in-browser, restores the saved
project and analyzes `project.lattice`. It creates a translucent surface
context with `buildSkinMesh(..., internalGraph=null)`. Neither Raw nor Clean is
unioned into that mesh. There is no FKEI Save, STL/3MF export, graph adoption or
production mutation action on the page.

## 2. Visual modes

- **Raw**: cyan Raw edges and nodes, 251 nodes / 270 edges;
- **Clean**: gold Clean topological edges, 101 nodes / 118 edges;
- **Overlay**: translucent cyan Raw plus opaque gold Clean, so an uncovered
  Raw segment or new Clean route remains visible instead of being hidden by a
  mode switch.

The surface/motif context stays fixed between modes. Independent diagnostic
layers show:

- retained Clean nodes in ivory;
- collapsed degree-2 Raw nodes in magenta;
- nearly coincident merge pairs in orange;
- Raw collinear overlap spans in red;
- unshared-ID endpoint contacts in yellow-green;
- all Motif anchors in white and the 20 support targets in green.

These are observation colors only. They are not material, strength or export
roles. Orbit and zoom change only the camera.

## 3. Topology, realization and provenance

The TASK 15 report now exposes three separate records:

```text
cleanTopology
  Node position + Edge endpoint relation

cleanEdgeRealizations
  Clean Edge ID -> current straight realization + radius

provenance
  Clean Node -> retained/merged Raw Node IDs
  Clean Edge -> contributing Raw Edge IDs + collapsed Raw Node IDs
  discarded Raw Edge -> explicit reason (none in this baseline)
```

The Lab draws Clean lines from `cleanTopology`, not from an assumption that a
topological Edge is permanently a cylinder. `straight` is the current display
realization. A later curve/spline/custom realization can replace that record
without changing endpoint identity or Raw lineage.

Every Raw Edge ID 0–269 occurs exactly once in a Clean Edge lineage or explicit
discard record. Every Raw Node ID 0–250 occurs exactly once as a retained/
merged Clean Node source or a collapsed-node lineage. Tests fail if an input
identity disappears or is counted twice.

Examples from the baseline:

- `Clean Edge 8 <- Raw Edges 20, 21, 28, 29; collapsed Raw Nodes 56, 63`;
- `Clean Edge 1 <- Raw Edges 2, 3, 4, 5, 6, 7; collapsed Raw Nodes 40–44`.

The page's Clean Edge selector highlights the selected Clean edge and shows
this endpoint, realization and lineage record.

## 4. Browser observation

Raw, Clean and Overlay were switched with real UI clicks in the in-app browser.
All graph counts, component 1 -> 1, Motif 38/38, support 20/20 and the exact
baseline SHA were visible. The collapsed-node layer was disabled and restored
with a hit-tested coordinate click. Clean Edge 8 was selected and displayed
the four Raw Edge and two collapsed-node IDs above. Console warnings/errors:
zero.

At the default Axome view, the main network footprint and its paths to Motif
anchors looked coincident between Raw and Clean. No obvious visual hole was
seen at the four-edge overlap represented by Clean Edge 8. Removing degree-2
subdivision makes the node representation easier to inspect, but 118 retained
paths are still visually dense. Whether this increases the desired spider-web
quality or makes the work too simple remains deliberately unresolved for the
author; the Lab supplies comparison, not adoption.

## 5. Adoption gate remains closed

Visual similarity is not mesh or print equivalence. Before any production
adoption, the author must choose the Clean interpretation, then a separate task
must compare realized geometry with the Migration Regression Harness, inspect
overlap/junction neighborhoods, run slicer QA and retain a rollback path.
Nothing in this Lab changes `buildSkinRebuildLattice()`, FKEI v1, finalGraph,
STL/3MF export or the baseline fixture.
