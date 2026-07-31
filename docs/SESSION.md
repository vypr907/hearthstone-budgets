## 2026-07-31 – Debt Strategy known_finance_charge simulation fix

- Fixed `src/lib/debt-payoff.ts` so debts with `known_finance_charge` start simulation at `balance + known_finance_charge` and skip `interest_rate` accrual entirely. Previously the charge only overwrote the final displayed interest, so payoff months and rollover timing were wrong. Display logic already used the known charge and is unchanged.
