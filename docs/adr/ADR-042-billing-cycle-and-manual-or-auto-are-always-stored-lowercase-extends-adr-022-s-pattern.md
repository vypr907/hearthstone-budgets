## ADR-042: billing_cycle and manual_or_auto Are Always Stored Lowercase (Extends ADR-022's Pattern)

Decision:
The bill and debt add/edit forms normalize both billing_cycle and manual_or_auto with
.trim().toLowerCase() before writing, identical to ADR-022's account_type rule. A
one-time data correction lowercases existing non-lowercase values in both columns,
across bills and debts.

Reason:
Both columns existed in mixed case (e.g. "Monthly"/"Auto" instead of "monthly"/"auto"),
which List/Detail views tolerated via a display-formatter but which broke the Edit
forms' selects, since select options match on exact value. Same root cause and same
fix pattern as ADR-022, applied to two more free-text-turned-enum columns.

Verified scope (2026-08-06):
- debts.billing_cycle: 30 of 35 rows are "Monthly" (capitalized); bills.billing_cycle
  is already all-lowercase and unaffected.
- bills.manual_or_auto: all 39 non-null rows are "Auto"/"Manual" (capitalized).
- debts.manual_or_auto: all 33 non-null rows are "Auto"/"Manual" (capitalized); 2 rows
  are null (unaffected, left as-is).

Status: Decided 2026-08-06. Not yet implemented.

