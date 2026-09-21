# Author Observation — Runner -> reviewable sliced 3MF -> Bambu Studio

Recorded: 2026-09-21 JST

## Author direction

For larger / slower-to-slice SKIN fabrication jobs, the preferred operational path is:

`Astra freezes the job -> FUKEI Slice Runner performs the heavy native slice -> Runner output sliced 3MF is opened in Bambu Studio -> Author visually reviews toolpath/material mapping -> Author sends from Bambu Studio`.

The goal is to avoid making the Author wait inside Bambu Studio for long native slicing while preserving a final human-visible review step before printer send.

Standalone G-code direct-print is not the preferred final workflow for multi-material or author-critical jobs because the Author cannot easily verify the final material/toolpath mapping from raw G-code.

## Required Author-visible review

Before printer send, Bambu Studio should expose at minimum:

- filament/material toolpaths in Preview;
- relevant layer positions with layer slider;
- warnings/floating regions;
- prime/wipe tower where applicable;
- project filament -> physical AMS slot mapping at the send dialog.

For multi-material jobs, the Author must be able to verify that the intended interface/material path actually exists in sliced toolpath, not merely that material-change commands exist somewhere in G-code.

## Evidence from the current mini study

The current A1 mini PETG/PLA study showed why this is required:

- a prior standalone-G-code route contained material-change commands;
- the physical result did not show the intended PLA interface;
- a later author-visible editable 3MF workflow allowed the Author to verify PETG/PLA placement in Prepare, confirm PLA model extrusion in Preview, and confirm PETG -> A1 / PLA -> A3 in the send dialog before starting the next print.

This observation does not claim the Runner currently loses material mapping. It establishes the required review boundary for future larger jobs.

## Boundary

This is an operational / review requirement, not authorization to:
- change artwork or Support geometry;
- change slicer semantics;
- auto-send to the printer;
- bypass the Author;
- declare a physical or Production PASS.

Runner remains `EXECUTE / RECORD`; Bambu Studio remains the final Author-visible review/send surface.
