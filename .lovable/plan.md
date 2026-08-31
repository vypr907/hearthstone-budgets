# Align "Aaron's - Dresser" with the actual lease agreement

## What the lease says

- Agreement 33984278, dated 3/14/2026, Aaron's LLC (Fairbanks, AK).
- Two items on one agreement: Madison II Dresser ($77.00/mo) + Madison II Mirror ($15.04/mo)
  = $92.04 lease + $5.06 tax = **$97.10 monthly renewal payment**.
- **24 monthly payments to own = $2,330.40 total cost to own.**
- Early-buyout cash price $1,297.42 (recorded as a note, not the tracked balance).

## Decisions you confirmed

- Balance basis: **total cost to own, $2,330.40**.
- Term: **monthly, $97.10**.
- Tax is rolled into the payment (minimum payment = $97.10); only late/other fees stay
  as separate fee lines that don't reduce the balance.
- 4 payments have been made and all 4 are already in the app's ledger.

## Target values for the debt row

| Field | Value |
| --- | --- |
| Name | Aaron's - Dresser (covers dresser + mirror; noted below) |
| Debt type | Loan / lease-to-own (keep current type unless it's `one_time`) |
| Starting balance | 2330.40 |
| Minimum payment | 97.10 |
| Billing cycle | Monthly |
| Due day | 14 |
| Plan payment count | 24 |
| Interest rate | 0 (lease-purchase, cost is baked into the total) |
| Notes | Agreement 33984278, dated 3/14/2026. Dresser $77.00 + Mirror $15.04 + tax $5.06 = $97.10/mo x 24 = $2,330.40. Cash price $1,297.42; weekly $22.42 x 104, semi-monthly $48.55 x 48. |

Remaining balance is **derived from the ledger, not typed in**: it should equal
$2,330.40 minus the sum of the four logged principal payments (if all four were the full
$97.10, that's $1,942.00 with 20 payments left).

## Process

1. **Read the live row and its ledger first.** Pull the current `debts` row for Aaron's -
   Dresser plus every transaction linked to it — amounts, dates, and which rows are fee
   lines. Nothing gets changed until those numbers are on the table, because the app's
   `remaining_balance` and `cycle_paid_to_date` have to stay consistent with what the
   ledger already says.
2. **Reconcile the four payments.** The one payment visible so far is $106.30 principal +
   $14.26 fee = $120.56, which is more than $97.10. Two possibilities: the $106.30 row
   includes a late fee that should be split out, or the principal genuinely differed.
   Report the four rows back to you and confirm before touching them; any that need
   restating go through the new payable-aware Edit (ADR-088), so the debt stays in sync.
3. **Set the due date correctly.** With a 3/14 agreement and 4 payments made, the next
   renewal is 7/14/2026 if payments started 3/14, or 8/14/2026 if the first was 4/14. The
   ledger dates from step 1 decide it; `next_due_date` and `due_day` get set to match, and
   `cycle_paid_to_date` reset to reflect the current open cycle only.
4. **Apply the field edits** in the Debt edit form (no schema change; all fields already
   exist: `starting_balance`, `minimum_payment`, `billing_cycle`, `due_day`,
   `plan_payment_count`, `interest_rate`, `notes`).
5. **Correct `remaining_balance`** to $2,330.40 minus payments applied, using a debt
   adjustment row if the difference needs an audit trail rather than a silent overwrite.
6. **Verify** the detail view: total owed <= starting balance, payoff projection shows 20
   remaining payments finishing ~Feb 2028, and status derives as expected for the open cycle.

## Open items to confirm during step 2

- Was the $14.26 a late fee, or delivery/other charge? It stays a fee line either way, but
  the label matters for the ledger.
- Should the mirror be tracked as its own debt? Recommendation: no — it's one agreement
  with one payment; splitting it would double the bookkeeping for no benefit.

## Docs

Append a `docs/SESSION.md` entry. No ADR needed: this is data correction using existing
fields, not a schema or behaviour change. If step 2 turns up that fees need to be modelled
differently from ADR-046, that would be raised separately before changing anything.
