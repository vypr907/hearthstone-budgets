# Pending screen (bottom nav)

## Findings you asked for

**Bottom nav capacity** — `src/components/BottomNav.tsx` currently holds 6 icon-only tabs:
Home (`/app`), All (`/app/everything`), Bills, Debts, Accounts, More. At 690px wide they fit
comfortably; on a 360px phone each tab is ~60px, still above the 44px tap-target minimum, so a
7th tab fits (~51px each) but gets tight. Options:

1. **Add Pending as a 7th tab** (nav stays at 7, icons shrink slightly). Simplest, nothing lost.
2. **Demote "Accounts" to More** and put Pending in its slot — Accounts is a lower-traffic
   reference screen and More already lists similar destinations.
3. **Demote "All" (Everything)** — but that is high traffic, not recommended.

Recommendation: option 1 (7 tabs). No demotion happens unless you say so.

**Reusable row layout** — `src/routes/app.transactions.tsx` is the existing "all transactions"
list, but its row markup is inline in that route (not a component) and is tangled with split
expansion, filters, and a detail dialog. The Pending screen will reuse its visual conventions
(Card + row, `formatMoney`, account/category/place name lookup maps, `groupLedgerRows` from
`src/lib/split-groups.ts`) rather than importing markup. Grouped subtotal styling follows the
Spending screen's group header pattern (`SectionLabel` + right-aligned subtotal).

**Clearing** — reuse only what exists:
- bill/debt-linked rows: `useMarkCleared()` from `src/lib/payments.ts` with
  `toPayable(kind, bill|debt)`. It finds the existing pending linked transaction, calls
  `applyClearedPayment`, clears paired fees, and rolls the cycle/due date — identical to
  clearing from Bills/Debts/Everything (ADR-035/036/046).
- unlinked manual rows: plain `status: "cleared"` update via the existing transaction update
  hook in `src/lib/data-hooks.ts`.

## What gets built

New route `src/routes/app.pending.tsx`:
- Lists every transaction with `status = 'pending'`, split lines collapsed via `groupLedgerRows`.
- Row: description/place (place name when set, else description), account, category chip when
  set, linked bill/debt name badge when applicable, date, amount.
- Sort: date (default, soonest first), amount, account, category.
- Group by: none (default), account, category — each group header shows a subtotal of its rows.
- Tap a row → confirm, then clear via the matching mechanism above; toast + query invalidation
  come from the existing hooks.
- Empty state via `EmptyState` ("Nothing pending").
- Own `head()` metadata.

`src/components/BottomNav.tsx`: add a 7th icon-only entry (Clock icon) → `/app/pending`.

## Docs

Reference existing ADRs only (ADR-026 nav style, ADR-035/036/046 clearing) — no new ADR.
Append to `docs/SESSION.md`; add the route to `docs/ARCHITECTURE.md`.
