## ADR-087: Hybrid Task Tracking (GitHub Issues/Milestones + docs/)

Decision:
Open, actionable work is tracked in **GitHub Issues**; phase progress in **GitHub
Milestones**; categorisation via a small **Label** set (`schema`, `ledger`,
`mobile`, `verification`, `tech-debt`, plus the GitHub defaults). The `docs/`
system stays the source of truth for everything that belongs with the code:
ADRs (`DECISIONS.md`), current-state briefing (`CONTEXT.md`), schema
(`SCHEMA.md`), architecture (`ARCHITECTURE.md`), dated history (`CHANGELOG.md`),
per-session log (`SESSION.md`), unready ideas (`SCRATCHPAD.md`).

`docs/TODO.md` is repurposed: it no longer lists tasks, only
working-as-designed limitations (so a future session doesn't "fix" them). There
is no `ROADMAP.md` — phases are Milestones.

When a PR closes a tracked Issue, its body carries `Closes #N` so GitHub links
and auto-closes on merge (the PR "Development" section).

The repo is **private** (changed from public 2026-08-27), so Issues are not
world-readable.

Reason:
The doc system is well suited to a mostly-solo, heavily-AI-assisted project — it
loads into the agent's context automatically each session, is versioned with the
code, and is greppable offline. But it has no commit↔task↔PR linking, no
per-phase progress view, and no notifications. Issues/Milestones add exactly
those without pulling ADRs / context / schema out of the repo. Task state
(discrete, closeable, benefits from PR linking) moves out; reference material
(needs to travel with the code and be in-context) stays.

GitHub Projects (v2 boards) were considered and skipped: the Codespaces
`GITHUB_TOKEN` cannot manage them (`Resource not accessible by integration`), so
they would be manual-only, and a board duplicates the Milestone/phase view at
this scale.

Status: Decided 2026-08-26. Implemented 2026-08-27 — labels + Milestones (Phase
12–14) + Issues #4–#10 created; `docs/TODO.md` stubbed; `CLAUDE.md` updated;
`README.md` rewritten to point here. Repo set to private by the user 2026-08-27.

---

