## ADR-016: `known_finance_charge` Redefined as Remaining Interest (Factor-Rate Debts Only)

Decision:
`known_finance_charge` represents interest still owed from today forward under a debt's
real fixed payment schedule — not the original total interest calculated at loan
origination. It is populated only for factor-rate/fixed-schedule debts where standard
`interest_rate`-based amortization doesn't apply (confirmed pattern: early payments are
disproportionately principal, later payments disproportionately interest, in a way
standard compounding doesn't produce). Standard-rate loans, credit cards, and
no-interest/no-agreement debts leave it null and rely on `interest_rate`.

Reason:
The field was originally set once at origination (total life-of-loan interest), which
double-counted interest already paid. This caused the payoff simulation to either finish
too early (paying off principal before the real finance charge was satisfied) or overshoot
(double-counting interest already paid), depending on which figure was used. Verified
against a real debt's payment history and live lender-site balance (Ticket 2).

Simulation change: for a debt with `known_finance_charge` set, the payoff simulation skips
`interest_rate`-based accrual entirely. That debt's simulated remaining cost is
`remaining_balance + known_finance_charge`, drained by minimum/extra payments the same as
any other debt.

Maintenance: this field goes stale every time a payment posts (interest paid reduces what's
left) — recalculate it after each payment on an affected debt, not just once at setup.

Formula:
```
known_finance_charge = (remaining_scheduled_payments − 1) × payment_amount
+ final_payment_amount
− remaining_balance
```

Status: Decided 2026-08-02. Correctly implemented 2026-07-31.
Note: The initial implementation only overwrote the displayed interest after the loop; the
simulation still accrued interest_rate monthly and started from principal only. Fixed so
`known_finance_charge` is added to the starting remaining balance and interest accrual is
skipped for that debt, matching this ADR.

