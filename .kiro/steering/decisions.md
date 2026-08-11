# Decisions Relevant to Phase 11

Full history in the repo's `docs/DECISIONS.md`. Condensed here to what Phase 11
work directly touches or must not break.

- **ADR-003**: transactions are the ledger source of truth — never invent a
  second payments table.
- **ADR-006/007**: bills/debts reference institutions, not accounts; paying
  account is resolved at payment time, defaulting to whoever last paid that
  item, from the full household account list (not institution-scoped).
- **ADR-035**: every submit/clear prompts for an amount and may be partial;
  cycle only resolves once paid-to-date covers what's due.
- **ADR-036**: payment cycle state (unpaid/pending/partial/cleared) is
  *derived* from the ledger, never stored as a flag you set directly.
- **ADR-037**: payable row is updated before the ledger row on every payment
  write; a 0-row update throws instead of failing silently.
- **ADR-044**: splits share `split_group_id`; edits delete + re-insert the
  whole group rather than patching lines.
- **ADR-045**: `debt_adjustments` = signed, non-payment balance changes
  (insurance, fees). Reused for advances in ADR-056 — do not create a second
  "advance" table.
- **ADR-046**: payment fees are a second, unlinked transaction; never credit
  the cycle. Unaffected by ADR-058's toggle — that's a different mechanism
  (the adjustments table, not the fee-transaction path).
- **ADR-047**: marking income received auto-writes split deposit transactions,
  remainder split absorbs variance, grouped by `split_group_id` = the income
  event id (idempotency depends on this).
- **ADR-049**: past-due is a computed walk (`src/lib/arrears.ts`,
  `computeArrears`) over missed cycles + `opening_arrears`, skipping cycles on
  or before `arrears_as_of`. ADR-057 extends this — read `computeArrears`
  before touching allocation logic.

## New this phase (drafted, pending your approval — see
`DECISIONS_ADDENDUM_PHASE11.md`)
ADR-055 (income deductions), ADR-056 (transfers/advances), ADR-057
(overdue-aware allocation), ADR-058 (balance-affecting adjustments toggle +
bill_adjustments table). **Do not implement any of these until they're
confirmed approved and the SQL has actually been run** — check with Steven if
unclear.
