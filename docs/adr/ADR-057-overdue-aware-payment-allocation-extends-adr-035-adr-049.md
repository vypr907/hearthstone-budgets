## ADR-057: Overdue-Aware Payment Allocation (Extends ADR-035, ADR-049)

Decision:
The pay dialog gains three amount presets: **Owed this cycle** (current
`cycle_amount_due − cycle_paid_to_date` behavior, unchanged), **Total due** (cycle +
live arrears total per `computeArrears`), and **Other amount**.

Allocation on a cleared payment, in order:
1. Credit the current cycle first (existing ADR-035 behavior, unchanged).
2. Any overflow beyond the current cycle reduces `opening_arrears` directly and
   advances `arrears_as_of` to the payment's date.

Reason:
ADR-049 already skips any cycle on/before `arrears_as_of` when walking missed cycles,
so reducing `opening_arrears` and bumping `arrears_as_of` on overflow is sufficient to
make `computeArrears` reflect the payment on the next render — no new columns, no
separate "arrears paid" ledger. For debts, an overflow payment already reduces
`remaining_balance` via existing cleared-payment logic (ADR-035); this ADR only adds
the `opening_arrears`/`arrears_as_of` update so the missed-cycle count also shrinks,
not just the balance.

**Flag for careful testing** (per project convention: this is the "worth debugging
carefully" category, like ADR-015's payoff math): verify a bill 3 cycles behind, paid
"Total due," correctly zeroes both `cycle_paid_to_date` state and the arrears walk —
i.e. `PastDueBadge` drops to 0 cycles, not just the dollar figure.

Status: Decided 2026-08-11. SQL run — no new columns to verify (reuses opening_arrears/arrears_as_of).

---

