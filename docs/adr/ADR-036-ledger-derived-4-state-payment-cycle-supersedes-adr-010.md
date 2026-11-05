## ADR-036: Ledger-Derived 4-State Payment Cycle (Supersedes ADR-010)

Decision:
Replace the fixed unpaid → pending → cleared → unpaid tap cycle (ADR-010) with a state
derived live from the ledger, shared across Bills, Debts, and Everything via the existing
payments.ts / ledger-state.ts modules:

- **UNPAID** — no transactions this cycle. Tap: prompt for amount, create a pending
  transaction → PENDING.
- **PENDING** — latest transaction for this cycle has status='pending'. Tap: clear that
  transaction (cycle_paid_to_date += amount, per ADR-035). If remaining > 0 → PARTIAL.
  If remaining <= 0 → CLEARED (cycle resolves: payment_status unpaid, due date advances,
  cycle_paid_to_date resets, per existing ADR-019/035 rollover).
- **PARTIAL** — no pending transaction, but cleared sum < amount due. Tap: prompt for
  amount, create a new pending transaction → PENDING.
- **CLEARED** — cleared sum >= amount due (cycle already resolved). Tap: show a confirm
  dialog ("This will reset this bill/debt — undo all payments this cycle?"). On confirm,
  full reversal per ADR-008, extended to delete ALL transactions tied to the cycle just
  resolved (not only the most recent), reset cycle_paid_to_date to 0, revert payment_status
  and due date → UNPAID. On cancel, no change.

Icons: UNPAID = neutral/empty, PENDING = clock (yellow), PARTIAL = remaining-balance
indicator (orange), CLEARED = checkmark (green).

Reason:
ADR-010's fixed 3-tap cycle assumed exactly one transaction per cycle. ADR-035 made that
false — a cycle can need any number of submit/clear rounds. Deriving state from the actual
ledger (not tap count) makes Bills, Debts, and Everything agree by construction, since
they already share payments.ts, and finally makes Undo only reachable from a genuinely
fully-paid cycle instead of firing on whatever the 3rd tap happens to be.

Supersedes: ADR-010. Extends: ADR-008 (reversal now clears every transaction in the
resolved cycle, not just the latest one) and ADR-009 (checked = CLEARED state, unchanged
in spirit, now precisely defined).

Status: Decided 2026-08-04. Implemented 2026-08-05.
Notes: state derives from `deriveCycleInfo()` in ledger-state.ts. Because clearing the
final payment advances the due date, a resolved cycle's transactions fall into the
previous window; the derivation looks back one interval (while today <= the new cycle
start) so a just-resolved item reads CLEARED rather than UNPAID. Reset uses
`useResetCycle()` and deletes every transaction in that window.

**Addendum (2026-08-19):** `deriveCycleInfo()` was purely ledger-transaction-derived —
zero awareness of `debts.remaining_balance`/`date_paid_off` — so a debt paid off any way
other than through Hearthstone's own Submit/Clear flow (balance corrected by hand, paid
off before tracking started, etc.) read UNPAID forever on the Everything screen, even
though the Debts screen's own `isPaidOff` (`app.debts.tsx:149`, `remaining_balance <= 0`)
correctly showed it as paid off. Fixed by overriding the derived state to CLEARED (and
`remaining` to 0) whenever `p.kind === 'debt'` and `remaining_balance <= 0`, after the
normal ledger-based derivation runs — matches the Debts screen's own definition instead of
introducing a third one. Bills have no equivalent balance field, so this is debt-only.
Distinct from ADR-047/ADR-072-era work: this doesn't touch `obligationsInRange()`'s
`date_paid_off` check (the Aurora Audiology fix) — a different code path entirely.

