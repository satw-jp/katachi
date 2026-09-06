# Project Authoring Reference

This reference preserves project-specific guidance that is not needed by every implementation worker.

## Author and observation

- Prefer comparison over decoration: side-by-side observation matters more than visual polish.
- Calculations must state their basis and precision limits; never present an estimate as certainty.
- The author is the eyes, hands, and final judge: artwork quality, physical experiments, safety decisions, and Study promotion require human judgment.
- Preserve the author's words and observations without rewriting them; AI may structure and distinguish observation from interpretation.
- Record observations, destructive tests, and human reactions in the relevant Study README with a date. Do not rely on memory.
- Tools are research residue. Promote a tool only after a Study demonstrates stable, standalone, reusable need and the author approves it.

## Study form

Each `src/studies/<name>/` is self-contained with code, `README.md`, `manifest.json`, and a record location such as `notes/`. A Study README normally contains `Question`, `Setup`, `Observation`, `Hypothesis`, `Related`, and `Next`. A repeated operation used by two or more Studies may be proposed for Library promotion when it is stable, explainable, and genuinely reusable.

## Study session checks

At the end of an implementation Study session, update the Study README observation, add the dated one-line revisit to `manifest.json`, verify the build and browser entry, and report changes and unresolved items in one paragraph. UI interaction must be checked with a real-coordinate click or `document.elementFromPoint`; synthetic `element.click()` is not a hit test.

## Project conventions

- Prefer browser-native, lightweight dependencies; do not build heavy infrastructure ahead of demonstrated need.
- Treat the field as first-class: surfaces derive from fields, operations write to fields, and operation history/recipes remain JSON serializable.
- Export meaningful numeric state so observations remain reproducible; show Version and UpdatedAt where the shared UI convention applies.
- Keep the shared whitespace/clearance color scale stable (blue = easier, red = limit); changing it requires an intentional research-document revision.
- When responsiveness and precision trade off, document the tradeoff and let the author choose.

## Physical safety

- AI may propose and record physical experiments; the human performs printing, breaking, loading, and contact with people.
- Do not call a tool or estimate “safe.” Display the estimate, basis, and limitations; final safety judgment belongs to the human.
- Objects handled by people, especially children, require a physical double-check regardless of screen predictions. The human confirms protective equipment and surroundings before destructive tests.

## Documentation versioning

Intentional revisions to `RESEARCH.md` retain version and date. Do not leave implementation/document drift unexplained. Record the reason for major technical, color-scale, or file-format decisions in the relevant README or research document.
