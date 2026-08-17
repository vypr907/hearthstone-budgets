## Session Notes

- Implemented ADR-066 (app-side): `useCreateAdvance` (`src/lib/data-hooks.ts`) now
  clears `date_paid_off` on the same debts-table update when the advance's target
  debt has `debt_type = 'advance'` and was previously paid off, reactivating it
  in place instead of leaving it hidden. Fixed `DEBT_TYPES` in
  `src/routes/app.debts.tsx` (was `"credit_card"`, DB check constraint expects
  `"credit card"` with a space) — the Type picker was already an icon-styled
  `Select` per ADR-054, just had a stale value. Debt list/detail now render
  `debt_type` via the existing `formatTypeLabel()` helper (`src/lib/visual-meta.ts`,
  already reused for institution_type/billing_cycle/adjustment_type) instead of
  the raw lowercase string. No schema change this session (constraint migration
  already run per prompt). Files touched: `src/lib/data-hooks.ts`,
  `src/routes/app.debts.tsx`. Next: none outstanding for this task.

- ADR-029 / ADR-067: expanded `CATEGORY_ICONS` (`src/lib/visual-meta.ts`) from
  30 to 54 emoji — same `IconPicker` component in `src/routes/app.categories.tsx`,
  no schema change. Implemented ADR-067: `CategoryDialog`'s Parent Category field
  is now a `Select` sourced from the household's distinct existing
  `categories.parent_category` values (plus "None"), with an inline "+ Add new"
  text-input toggle for a genuinely new label — `parent_category` stays a plain
  text column, no schema change. Files touched: `src/lib/visual-meta.ts`,
  `src/routes/app.categories.tsx`. Next: none outstanding for this task.

- ADR-029: expanded `CATEGORY_ICONS` again (`src/lib/visual-meta.ts`), 54 → 77
  emoji, de-duplicated against the existing set. Same `IconPicker` grid, no
  UI/schema change. Files touched: `src/lib/visual-meta.ts`. Next: none
  outstanding for this task.
