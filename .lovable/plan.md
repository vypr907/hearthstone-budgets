# Enforce the debt payoff-date invariant

The Everything filter is behaving as written: it only hides a paid-off non-Advance debt after `date_paid_off` is populated. The real defect is that some balance-changing paths can leave a non-Advance debt at an effectively-zero balance without setting that date.

## Changes

1. **Centralize the rule in a shared helper**
   - For non-Advance debts, a remaining balance `<= 0.005` must have `date_paid_off`.
   - When a balance moves above that threshold again, clear `date_paid_off`.
   - Advance debts remain exempt because zero is their normal reusable state.
   - Preserve an explicitly supplied transaction/payment date; otherwise use the action date, then today only as the final fallback.

2. **Apply it to every debt balance write**
   - Payment and historical-payment flows.
   - Linked payment edit, correction, reversal, and cycle reset flows.
   - Manual debt edits.
   - Balance-affecting debt adjustments and adjustment deletion.
   - Keep Advance-specific reactivation behavior unchanged.

3. **Add a database guard and repair migration**
   - Extend the existing payoff/Advance decision rather than inventing a separate competing rule.
   - Add a `BEFORE INSERT OR UPDATE OF remaining_balance, debt_type` trigger so future writes outside the current UI cannot violate the invariant.
   - Backfill existing non-Advance rows at or below the threshold that have no payoff date, preferring their latest linked cleared payment date and falling back to the current date when no payment history exists.
   - Provide the SQL migration for you to run manually in your own database editor; no Lovable Cloud.

4. **Keep Everything strict**
   - Do not add a display-time zero-balance workaround. Once the stored invariant is repaired, the current pay-period filter remains the single rule: paid-off non-Advance debts appear only when `date_paid_off` is in the current pay period.

5. **Verification and documentation**
   - Add focused tests for threshold, reactivation, explicit historical date, and Advance exemption.
   - Update the relevant existing ADR, schema documentation, session notes, and changelog according to the project workflow.
   - Local build verification will be flagged for Codespace/CI because this project's documented Windows policy blocks local build binaries.

## Expected result

The circled invoice receives a real payoff date during the repair. If that date is outside the current pay period, it disappears from Everything. Future non-Advance debts cannot reach an effectively-zero remaining balance without a populated payoff date, regardless of which supported write path changes the balance.
