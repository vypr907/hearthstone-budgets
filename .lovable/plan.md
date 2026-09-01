# Why the 06-03 invoice is still listed

The new rule only hides a debt when it has a stored payoff date (`date_paid_off`). That field is written only by the in-app payment flow at the moment a payment drives the balance to exactly zero. A debt that was settled another way — imported, manually edited to a zero balance, corrected, or cleared before that logic existed — ends up settled but with no payoff date, so the filter treats it as still open and keeps showing it.

The circled row is that case: it derives as cleared with nothing owing, but has no payoff date, so it slips through.

## Fix

Broaden the hide rule for non-Advance debts to "settled and not recent" rather than "has a payoff date":

- Treat a debt as settled when `date_paid_off` is set OR its remaining balance is effectively zero (<= half a cent) OR its derived ledger state is `cleared` with nothing outstanding.
- Determine the reference date in this order: `date_paid_off`, else the date of the most recent transaction linked to that debt, else its due date.
- Hide the debt when that reference date falls outside the current pay period.
- Advance debts and bills keep the current behavior (always shown).

## Technical notes

- Change is confined to the debt `.filter(...)` in `src/routes/app.everything.tsx`, using the existing `dateInPeriod()` from `src/lib/pay-period.ts` and the already-computed payable/ledger info so no new queries are needed.
- Falling back to the last linked transaction date keeps a just-paid legacy invoice visible for the rest of the current pay period.
- Docs: append a bullet to `docs/SESSION.md` and extend the existing ADR covering the Everything payoff filter (no new ADR number).
