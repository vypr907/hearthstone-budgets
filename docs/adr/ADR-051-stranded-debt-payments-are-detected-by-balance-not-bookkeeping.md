## ADR-051: Stranded debt payments are detected by balance, not bookkeeping
Decision: A debt stops being flagged as "stranded" once its balance has already
come down by at least everything ever cleared against it, or once the debt row
was updated after the newest cleared ledger row.

Reason: The old check only looked at `cycle_paid_to_date`, so a payment repaired
by hand (balance corrected, cycle columns untouched) kept showing the repair
card forever.

Status: Decided 2026-08-11. Implemented.

