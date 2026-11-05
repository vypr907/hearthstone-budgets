## ADR-025: zod upgraded to v4
Decision: Upgrade zod from ^3.24 to ^4.
Reason: @tanstack/start-plugin-core calls `.prefault()`, which only exists in zod v4; on zod 3 the
Vite config failed to load and the dev server would not start.
Status: Decided 2026-08-03. Implemented.


