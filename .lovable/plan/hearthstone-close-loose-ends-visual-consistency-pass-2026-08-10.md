# Hearthstone — Close Loose Ends + Visual Consistency Pass

## Context

TODO and SESSION have two open "loose ends" from the just-shipped Phase 7, plus a
known visual-consistency debt built up across many screens. This pass closes the
loose ends first, then does a focused visual-consistency cleanup. No new
features, no schema changes.

## Part A — Close the loose ends

### A1. ADR-047 follow-up: account prompt when an income source has no split rows

**Problem.** `useMarkIncomeReceived` (src/lib/income-hooks.ts) returns
`{ deposits: 0 }` when the income source has no `income_source_splits`. The event
is marked "received" but no deposit transaction is written, so the money never
hits the ledger. There is no way to pick an account.

**Fix.**
- `useMarkIncomeReceived` gains an optional `accountId` param. When the source
  has no split rows (or none resolve to a usable account), and `accountId` is
  provided, write a single cleared deposit transaction for the full received
  amount into that account, grouped by `split_group_id = event.id` (keeps
  idempotency). If no `accountId` and no splits, throw a clear error instead of
  silently returning `{ deposits: 0 }`.
- In `app.paycheck.tsx`, the `receive()` handler opens a small account-picker
  dialog (reusing the existing account list + a confirm-amount field, mirroring
  the pay-flow prompt) **only when the source has no usable split rows**. When
  splits exist, keep the current one-tap behaviour. This keeps the common path
  fast and only interrupts the edge case.

### A2. Auto-create the "Fees" category so ADR-046 fee rows are categorised

**Problem.** `insertFeeTransaction` (src/lib/payments.ts) looks up a household
category named "Fees" (case-insensitive) and tags the fee row with it — but only
if one already exists. There is no onboarding/seed flow that creates default
categories, so most households have no "Fees" category and fee rows land
uncategorised.

**Fix.** In `insertFeeTransaction`, when no "Fees" category is found, insert one
(`name: "Fees"`, `parent_category: "Misc"`, household-scoped) and use its id.
This makes fee rows categorised for every household regardless of when it was
created, with no migration or manual Supabase step. (Marked TODO item complete.)

### A3. Docs

- SESSION.md: mark A1/A2 done, drop the two known-issue lines.
- TODO.md: check off the ADR-047 follow-up and "Fees" category items.
- DECISIONS.md: append a short note to ADR-047 documenting the no-split-row
  account prompt; no new ADR.

## Part B — Visual consistency pass

Audit findings (all confirmed by reading the screens):

1. **Section-label typography drifts.** Card section headers use a mix of
   `text-[11px]` vs `text-xs`, `tracking-widest` vs `tracking-wide`,
   `font-semibold` vs `font-medium`. Dashboard, Spending, Snapshot, Bills, Goals
   each spell it differently.
2. **No shared empty state.** Every screen hand-rolls its own "No X yet" line
   with varying copy, size, and placement (15+ instances).
3. **Control heights mix `h-11` / `h-12`.** Auth and the Everything search use
   `h-12`; most app selects/inputs use `h-11`; some forms mix both.
4. **Hardcoded white overlays on the Dashboard hero** (`bg-white/15`,
   `bg-white/20`, `bg-white/85`) — bypass the token system and don't adapt to
   dark mode on the gradient surface.
5. **Two filter/search UIs.** Everything builds its own search + selects;
   Bills/Debts/Accounts use the shared `ListControls`.

### B1. Shared `SectionLabel` component
New `src/components/SectionLabel.tsx` rendering the canonical label style
(`text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`).
Replace the ad-hoc section-header `<p>`/`<h2>` instances across Dashboard,
Spending, Snapshot, Bills, Goals, Categories with it. One source of truth.

### B2. Shared `EmptyState` component
New `src/components/EmptyState.tsx` (icon + message, muted, consistent padding)
used for the "No X yet" / "Nothing matches" cases. Replace the 15+ inline
strings. Keeps copy consistent and removes duplicated markup.

### B3. Standardize control heights
- App-screen inputs and selects: `h-11` (already the majority).
- Full-width primary/auth inputs and the global search: `h-12`.
Sweep the forms for stray `h-12` where `h-11` is the screen norm and vice-versa.

### B4. Fix hardcoded hero overlays
Replace `bg-white/15`, `bg-white/20`, `bg-white/85` on the Dashboard hero with
`bg-brand-foreground/15` etc. so the tints track the theme tokens (and read
correctly in dark mode). Pure presentation, no logic change.

### Out of scope this pass (listed, not done)
- Consolidating Everything's filter UI onto `ListControls` (bigger refactor,
  changes a working screen's layout).
- Unifying the two status representations (`StatusBadge` vs `stateVisual`
  icon) — both are intentional in different contexts; revisit if it reads
  inconsistent in use.
- Unifying the Institutions/Accounts *detail* dialogs (separate consolidation
  task; the add/edit forms are already shared).

## Verification
- `bun run build` / typecheck clean.
- Manual: mark-received on a no-split income source prompts for an account and
  writes one deposit; paying a bill with a fee creates a categorised "Fee" row
  even when no Fees category pre-exists.
- Eyeball Dashboard, Spending, Snapshot, Bills, Goals for consistent labels,
  empty states, and control heights; toggle dark mode to confirm the hero.

## Documentation
Update SESSION.md, TODO.md, and append to DECISIONS.md (ADR-047 note) per the
project's documentation rules. No SCHEMA/ARCHITECTURE changes.
