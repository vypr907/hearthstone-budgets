# hearthstone-budgets — Agent Instructions

## Mission
Long-term engineering partner. Optimize for continuity, correctness, low token usage.
Preserve approved architecture. Smallest correct change. Reuse before creating.

## Stack (locked — do not re-derive)
React/Vite frontend, self-managed Supabase Postgres, Capacitor (Android),
Google Play Internal Testing. Two shared household logins, identical data.

## Workflow loop (mandatory)
notes → ADR (docs/DECISIONS.md) → SQL migration (manual, Supabase SQL Editor,
no CLI) → code change → update docs/SCHEMA.md, docs/CHANGELOG.md,
docs/SESSION.md, docs/TODO.md.

## SESSION.md logging
After completing each meaningful step (not each file edit), append an entry
to docs/SESSION.md: what changed, files touched, ADR # referenced, next step.
Do this before moving to the next task, not just at the end of the session.
At session end, summarize docs/SESSION.md into docs/CHANGELOG.md, then clear it.

## Hard rules
- No schema change without an approved ADR. Cite the ADR # in your own notes.
- Never invent tables/columns/business rules — verify against live schema
  (Supabase SQL Editor) before assuming docs are current.
- TODO.md = scoped/actionable only. Unready ideas → SCRATCHPAD.md.
- Don't rewrite working code unless asked.

## Known environment constraint
Windows AppLocker/SRP blocks node_modules\.bin\* binaries (vite, tsc, likely
Gradle). Cannot verify builds locally — do not attempt, do not suggest running
vite/tsc directly. Flag if a task needs build verification.

## Doc hierarchy
Current conversation > existing code > existing schema > docs/DECISIONS.md >
docs/SCHEMA.md > docs/CHANGELOG.md/TODO.md (only for roadmap questions).

## Documentation Rules (docs/) — part of every task, not a wrap-up step
Create any of these files if they don't exist yet.

1. SESSION.md — after each completed unit of work this session, append one
   concise bullet: what changed + user-visible summary. Record known issues
   as a sub-bullet if any surfaced.
2. SCHEMA.md — update whenever tables/columns/indexes/constraints change.
3. ARCHITECTURE.md — update whenever architecture changes.
4. DECISIONS.md — update whenever an implementation choice future devs
   should know about is made. Match existing entry format exactly:
   ## ADR-<xxx>: <Title>
   Decision:
   Reason:
   Status: Decided <DATE>. Implemented/Not implemented.

   ADR lookup logic (in order):
   - Prompt names an ADR number explicitly → append to that ADR, never
     create a new number for it.
   - No ADR named, but change looks like a variant of an existing entry →
     ASK before creating a new ADR. Do not guess.
   - Otherwise → new ADR, next sequential number.
5. TODO.md — update as tasks are discovered/completed. Remove completed
   items — this file is current open items only, never history.
6. ROADMAP.md — update whenever milestones change.

Do these inline as work happens, not batched at the end.