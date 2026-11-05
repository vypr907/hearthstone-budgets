## ADR-078: Separate `arrears_paid_to_date` Counter, Decoupling Arrears Payments From `arrears_as_of` (Extends ADR-049, ADR-076)

Decision:
Add `arrears_paid_to_date numeric default 0` to `bills` and `debts`. `computeArrears`
(`arrears.ts`) changes its formula to `max(0, openingArrears + missedAmount −
arrearsPaidToDate)` — the live missed-cycle walk always computes its full raw total
(current cycle included), `opening_arrears`/`arrears_as_of` revert to ADR-049's original
meaning only (a one-time manual pre-tracking carry-in), and `arrears_paid_to_date` is a
running total that:
- `applyArrearsPayment` (ADR-076) increments by the payment amount, instead of writing
  `opening_arrears`/`arrears_as_of`.
- `applyClearedPayment`'s overflow-into-arrears reduction (the ADR-076 generalization,
  both bills and debts) also increments it by the overflow, instead of writing
  `opening_arrears`/`arrears_as_of`.

No reset condition — plain monotonic accumulation. (Caught during implementation: an
earlier draft of this ADR called for resetting on every cycle resolve, reasoning that
missed cycles the counter was tracking fall behind the walk's new start once it rolls
forward. That's wrong — `cycle_paid_to_date` resets on *every* resolve, overflow or not,
so a literal reading would wipe out legitimately-accumulated arrears credit the very
next time any normal payment resolves the current cycle. In fact a resolve only ever
advances the due date by one cycle, and that shrinkage is always covered by
`cycle_paid_to_date`, never overlapping with what `arrears_paid_to_date` tracks — no
reset is needed for the walk and the counter to stay consistent.)

One pre-existing edge case this doesn't (and isn't meant to) solve: `applyArrearsPayment`
never touches `cycle_paid_to_date` (ADR-076, by design — Submit/Clear stays independently
available for the current cycle), so if an arrears payment covers a cycle that later
becomes "current" as the due date rolls forward, `deriveCycleInfo` still shows that cycle
as unpaid and offers Submit — paying it there too would double-pay it. Already an
accepted ADR-076 UX gap, unrelated to this ADR's fix.

`priorCyclesArrears`/`arrearsPaymentTag` need no code change — they already compute from
`computeArrears`'s output, which stays correct under the new formula.

Reason:
ADR-076 wrote arrears payments through `opening_arrears`/`arrears_as_of`, reusing
ADR-049's fields. That's wrong for this shape of consolidation: `arrears_as_of` can only
suppress a PREFIX of the missed-cycle walk (`counts = cursor > asOf` — cycles on/before
it don't recount), correct for ADR-049's original case where the thing being consolidated
(pre-tracking history) is always the walk's earliest part. ADR-076 consolidates the
OPPOSITE shape: `priorCyclesArrears` deliberately excludes the walk's first (current)
cycle so Submit/Clear can still credit it normally — meaning everything EXCEPT the
earliest entry gets folded in. Setting `arrears_as_of = today` to represent that doesn't
suppress "everything after the current cycle" — it suppresses the ENTIRE walk, including
the current cycle, since every past-due cycle's date is before today by definition.
Surfaced 2026-08-21 via Lovable QA: a $50 payment against $200 in prior arrears (current
cycle $100 + 2 further missed cycles) correctly reduced what future arrears payments
could draw down, but the immediate PastDueBadge dropped to $150 instead of $250 — the
current cycle's own $100 vanished because the whole walk was suppressed, not just its
already-consolidated tail.

A running counter sidesteps the direction problem entirely: it's subtracted from
whatever the walk (always computed fresh, in full) currently totals, regardless of which
part of that total it's covering.

Migration:
```sql
alter table bills add column if not exists arrears_paid_to_date numeric default 0;
alter table debts add column if not exists arrears_paid_to_date numeric default 0;
notify pgrst, 'reload schema';
```

Extends: ADR-049, ADR-076.

Status: Decided 2026-08-21. Implemented 2026-08-21 — pending the SQL migration above
being run manually in the Supabase SQL Editor.

