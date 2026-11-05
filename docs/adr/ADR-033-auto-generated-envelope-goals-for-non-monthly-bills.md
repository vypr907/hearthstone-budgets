## ADR-033: Auto-Generated Envelope Goals for Non-Monthly Bills

Decision:
Add `savings_goals.account_id` (nullable FK to accounts — several goals may share one
account, e.g. all point at a "Annuals" savings account) and `savings_goals.linked_bill_id`
(nullable FK to bills, unique). When a bill's billing_cycle is quarterly, bimonthly,
annually, or custom (i.e. > 1 month), the app auto-creates one savings_goals row with
linked_bill_id set, target_amount = the bill's amount, target_date = the bill's
next_due_date. Biweekly bills do NOT get an envelope — their monthly-equivalent is
just amount × 2, no separate saving needed since they occur within the month.

Monthly-equivalent (for obligations/budget totals per ADR-034):
- monthly: amount
- biweekly: amount × 2
- quarterly: amount / 3
- bimonthly: amount / 2
- annually: amount / 12
- custom: not automatically prorated — flagged for manual monthly-equivalent entry
  (open question, see below)

A dedicated "Add to envelope" action on the bill card creates a transaction with
linked_goal_id = the envelope's id, status='cleared', separate from the bill's own
payment transaction (linked_bill_id) to its institution. This lets money be set aside
ahead of the due date without it looking like the bill was paid.

Reason:
A quarterly $18 bill (Solo) shouldn't blow a monthly budget the one month it's due,
nor should it be invisible the other two months. Prorating it into monthly obligations
plus a real envelope balance solves both — matches the existing savings_goals /
ledger-derived-balance pattern (ADR-027) instead of inventing a second mechanism.

Open question: `custom` billing_cycle has no fixed interval, so it can't be
auto-prorated the same way. Needs either a stored cycle-length-in-months field or
manual monthly-equivalent entry — deferred until a real `custom` bill needs this.

Status: Decided 2026-08-04. Partly implemented 2026-08-04 — `monthlyEquivalent()` /
`needsEnvelope()` in format.ts, envelope auto-creation in `useUpsertBill()`, optional
`account_id` on the goal form. The bill-card "Add to envelope" action ships the compact SetAsideAction (2026-08-06).

