# Features I want
- [ ] per-paycheck budgeting
- [ ] bill calendar (sync with Google calendar)
- [ ] tracking for side income, like UberEats driving
- [ ] bill detail view
- [ ] be able to handle partial payments and payment reversals
- [ ] bill/debt that is pending should not show 'Submitted' button

# Views
- [ ] bill detail
- [ ] institutions

# Next Lovable prompt

Bug: clearing a bill advances next_due_date by a flat +1 month regardless of billing_cycle.
"SoFi - Invest" has billing_cycle = 'biweekly' but jumped 7/30/26 -> 8/30/26 (should be
8/13/26, +14 days).

Fix the date-advance logic (wherever a bill's payment_status is set to 'cleared') to branch
on billing_cycle:
- monthly -> +1 month
- biweekly -> +14 days
- quarterly -> +3 months
- bimonthly -> +2 months
- annually -> +1 year
- custom -> don't auto-advance, leave next_due_date as-is for manual editing

Apply this consistently wherever this logic lives (Bills screen, Everything screen once
pointed at payments.ts).

Fix "Undo" on Bills and Debts so it's a full reversal, not just a status flip. Currently it
only resets payment_status to 'unpaid' — it needs to also:

1. Delete the transactions row created when this bill/debt was marked pending/cleared
   (matched via linked_bill_id / linked_debt_id).
2. Bills: revert next_due_date back to its value before the cycle-advance logic ran (i.e.
   subtract the same billing_cycle interval that was added when it was cleared — monthly:
   -1 month, biweekly: -14 days, quarterly: -3 months, bimonthly: -2 months, annually: -1
   year, custom: don't adjust).
3. Debts: revert remaining_balance by adding back the transaction amount that was subtracted
   when it cleared.

This only applies to Undo. Don't change how normal payment history is retained otherwise —
transactions stay permanent except in this specific full-reversal case.