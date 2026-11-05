## ADR-043: Spend history hints on paycheck allocations & schedule history
Decision:
Each category allocation row on the Paycheck Budget screen shows "Last month $X ·
3-mo avg $Y" derived from buildActualResolver() (same ledger/override rules as the
Spending screen), plus a "Use avg" shortcut that writes the rounded average as the
allocation. The Payment Schedule screen gains a collapsible "Previous months"
section listing the last 6 calendar months plus any older checked-off month, each
with its check-off toggle only — no per-debt breakdown.

Reason:
Allocating blind led to guesswork; the resolver already computes per-month category
spend, so reusing it costs no new queries. Past schedule months were dropped entirely
at month rollover, losing the check-off record; past per-debt amounts cannot be
re-simulated from today's balances, so history shows month + paid state only.

Status: Decided 2026-08-06. Implemented.

