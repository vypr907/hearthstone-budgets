# Everything page: category editing, institution watermark, overdue chip

## 1. Editing the category

Bills already have a category picker in their edit dialog. Debts do not — the debt form has name, balances, rate, cycle, institution, notes, etc., but no category field, which is why so many debt rows read "Uncategorized" with no way to change it.

- Add a Category picker to the debt edit dialog, using the same control and "none" handling the bill dialog uses, and save it to `category_id`.
- Placed next to Institution so both classification fields sit together.

This makes category editable from the Everything screen too, since row tap already opens the shared detail dialog with Edit.

## 2. Institution logo as a faded row background

Each row gets its institution's logo as a low-opacity watermark behind the text, left-aligned with the item name (starting where the title starts, not the card edge), clipped to the card and vertically centered.

- Rows whose bill/debt has no linked institution, or whose institution has no logo, render nothing extra — no fallback emoji watermark, so the list stays quiet.
- The watermark is decorative only: not focusable, not read by screen readers, and never intercepts taps.
- Opacity tuned so it stays legible in the dark theme (roughly 8–12%).

## 3. Status chips: drop Unpaid/Cleared, add Overdue

- Remove the `StatusBadge` from the Everything row — the circular state icon already communicates unpaid / pending / partial / cleared.
- Add a red "Overdue" chip, shown only when the item's due date is before today and the item is not cleared.
- Keep the existing "still owed this cycle" line for partials, since that carries an amount the icon can't show.

## Technical notes

- Files: `src/routes/app.everything.tsx` (row layout, watermark, chip), `src/routes/app.debts.tsx` (category field in `DebtDialog`).
- Watermark uses the existing `useInstitutions` hook plus the `useInstitutionIndex` lookup in `src/components/ObligationIcon.tsx`; the image comes from `institution.logo_url`.
- Overdue is derived in the same `useMemo` that already computes `inPeriod` / `inMonth`, comparing `due_date` to `todayISO()` against the ledger state — no new queries and no schema change.
- Docs: append a SESSION.md entry; the debt category field is a form-level change, so no new ADR unless you want the Everything row model recorded.
