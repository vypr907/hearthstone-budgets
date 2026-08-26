## Session Notes

- 2026-08-26 (post session-close, same day) — ADR-081 auto-transfer
  code-review follow-ups (findings 2, 4, 5, 6). All in
  `src/lib/auto-transfers.ts` + `src/routes/app.bills.tsx`; ADR-081 addendum
  written; first tests for the module (`src/lib/auto-transfers.test.ts`, 10
  tests; suite 77 → 87).
  - Finding 6 (the real bug, surfaced by the new tests): "Processed / Undo"
    never showed after processing — the credit leg's `resolved_cycle_due_date`
    tag (one cycle back) is filtered out by `eligible`, so state flipped
    straight to "unpaid" and re-processing was possible. Fixed the
    resolved-cycle lookback: fires while `today < next_due_date`, matches the
    exact tag against `linked`. Cleared until the advanced due date arrives.
  - Finding 2: server-side double-process guard in `useProcessAutoTransfer`
    (reject if a leg tagged to this exact cycle already exists).
  - Finding 5: `useUndoAutoTransferProcess` targets the leg for the cycle
    `next_due_date` was advanced past, not most-recent-by-date.
  - Finding 4: paused (`is_active=false`) auto-transfers now render dimmed with
    a "Paused" pill and no Process button in the Bills list.
  - Finding 3: left as-is — the transaction's today-date is load-bearing for
    `deriveAutoTransferState`'s window logic.
  tsc + build + 87 tests green.

  Known open (not blockers): `.devcontainer` node pin dropped (commit
  f9646a3); prettier/lint left failing (repo-wide, pre-existing); branch
  `session/2026-08-26-todo-batch` is local only — `git push` is blocked in this
  environment, user to push + open the PR.
