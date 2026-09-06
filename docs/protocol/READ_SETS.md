# Role-specific Read Sets

| Role | Always preload | Load when relevant | Lazy / concrete need |
|---|---|---|---|
| Overall SOL | CORE; relevant CURRENT fronts; relevant task | evidence and dependency pointers | cross-lane CURRENTs; architecture; history |
| Team SOL | CORE; own lane CURRENT front; task | evidence and named dependencies | other lanes; broad research/history |
| LUNA | CORE minimum; lane CURRENT front; bounded task | named code/evidence | STATEMENT; RESEARCH; other lanes; old tasks |
| Research SOL | CORE; research task/current | relevant research sources; named implementation dependencies | unrelated implementation history |
| Research Astra | research task; named packages/evidence | explicitly named lane dependency | full AB/C/HANA/ART/Viewer CURRENTs |
| Organization / maintenance LUNA | CORE; infrastructure task; exact paths/state | manifests and preservation evidence | project philosophy; unrelated lanes |
| Viewer SOL/LUNA | CORE; VIEWER CURRENT front; Viewer task | FKEI/Viewer evidence | HANA/SKIN philosophy; other lanes |

`STATEMENT.md`, `RESEARCH.md`, architecture docs, historical reports, and other lane CURRENTs remain available when a concrete dependency is identified. They are not globally forbidden; they are not default preload.
