## ADR-092: Rent-to-own debts are tracked at total cost to own

Decision:
A rent-to-own / lease-purchase agreement (Aaron's and similar) is tracked as a
debt whose balance basis is the **total cost to own** — the scheduled payment
times the number of payments — not the early-buyout cash price. `debts.amount`
per cycle is the full scheduled payment with tax rolled in. Any optional add-on
(a protection / insurance plan) is not part of the payment count and is posted
as a fee line (ADR-046), never reducing the balance.

Applied 2026-08-31 to "Aarons - Dresser" (debt `8004b659-7e01-4630-8e76-bea58065ab16`,
"Our Household") via `scripts/migrations/2026-08-31-aarons-dresser-lease-alignment.sql`
(data-only, no schema change): balance basis $97.10 × 24 = $2,330.40 (was the
$1,297.42 cash price); `remaining_balance` $1,942.00 after 4 payments;
`minimum_payment` $97.10. Each historical payment row grew $5.06 and its paired
tax-fee row shrank $5.06, so cash out of the accounts is unchanged. Verified
live 2026-09-01.

Reason:
The tracked balance had been set to the early-buyout cash price, which the
household is not paying — they are on the 24-payment plan, so the amount that
actually retires the debt is the total-cost-to-own figure. Using the cash price
understated the obligation and made payoff-progress math wrong. Tax belongs in
the payment (it is owed every cycle); the protection plan does not (it is
optional and buys nothing toward ownership), so it stays a fee.

Status: Decided 2026-08-31. Implemented 2026-08-31 (migration), verified 2026-09-01.

