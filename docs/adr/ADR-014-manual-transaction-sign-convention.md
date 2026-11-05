## ADR-014: Manual transaction sign convention
Decision: In the quick-add transaction dialog a positive amount is stored as a negative (money out); a negative amount is stored as-is (money in).
Reason: Most manual entries are spending, and it keeps the form to the four requested fields with no extra direction toggle.
Status: Decided 2026-08-02. Implemented.

**2026-10-14 addendum — the Expense-mode hint is wrong advice for a
credit-type account.** Confirmed via code trace (`AddTransactionFab.tsx`'s
`submitExpense`): this decision's own hint text ("Enter a negative amount
for money in") describes the general/checking case, but for a
`credit`-type account it's actively misleading — a credit account's
"money in" (a payment toward the balance) must be a *positive* stored
amount (the convention `effectiveDebtBalance`/`creditOwed`,
`balances.ts`, and the ADR-111 episode view all already trust), not a
negative one. Typing a negative number in Expense mode on a credit
account, following this hint literally, increases what's owed instead of
reducing it. Fixed with an account-type-aware swap: when the selected
account is `credit`-type, the Expense-mode hint now points at Income or
Transfer mode for a payment instead of repeating the generic (here,
wrong) advice. Every other account type is unaffected — this decision's
original wording and behavior stand unchanged for them.
Status: addendum decided 2026-10-14. Implemented 2026-10-14.

