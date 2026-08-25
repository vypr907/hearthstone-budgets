## Session Notes

- Mobile layout fixes, diagnosed from 8 real-Android-phone screenshots
  (`docs/planning/screenshots/`) traced back to actual layout code, not
  guessed. Viewport meta tag already correct (`src/routes/__root.tsx`) —
  these are real spacing/sizing bugs, not the classic missing-viewport-tag
  issue. All changes are CSS-class-only, no logic/schema/ADR.
  - Root cause found for the floating "+" button covering real content on
    nearly every screen (Bills, Debts, Institutions, Transactions,
    Dashboard): `src/routes/app.tsx`'s `AppLayout` only reserved 6rem of
    bottom padding (enough for `BottomNav`), but the FAB sits 6rem up and is
    itself 3.5rem tall, so its footprint ran 6rem-9.5rem up — outside the
    reserved padding. Bumped to `pb-[calc(10rem+env(safe-area-inset-bottom))]`.
    One line, fixes it everywhere since the FAB/nav are mounted once in the
    shared layout.
  - Dashboard's "Budget vs actual" and "Monthly summary" category tiles
    truncated long names ("Finan...", "Entert...", "Busin...") — the
    `grid-cols-2` layout only left ~66px for text after the 44px
    `ProgressRing`. Per user's choice (keep the ring, drop the 2-column
    grid), switched both to single-column full-width rows (`space-y-2`
    instead of `grid grid-cols-2`), added `w-full` to the tile buttons since
    they'd relied on CSS grid's implicit stretch.
  - Per user's choice, also widened scope to bump small uppercase "eyebrow"
    labels app-wide one notch (`text-[10px]`→`text-[11px]`,
    `text-[11px]`→`text-xs`) — `src/components/SectionLabel.tsx` plus 62
    other occurrences across 12 route/component files, done as targeted
    substring replacements (matching shared Tailwind class prefixes,
    `replace_all`) rather than reviewing every line individually, since it's
    a pure font-size swap. Deliberately skipped non-uppercase small text
    (tabular-nums detail rows, badge chips, a fixed-width ring number, the
    dev-only ThemeTokenPreview screen) where bumping risked new overflow
    instead of fixing legibility. Verified with a clean re-grep after — no
    double-bumps, nothing missed.
  - Debt Strategy's 4-column scenario table (Scenario/Avalanche/Snowball/
    Custom) was already correctly wrapped in `overflow-x-auto` — the
    "Custom" column is reachable by swiping, just not discoverable. Added a
    small "Swipe the table left to see the Custom column →" caption.
- Not yet build-verified (Windows AppLocker blocks local `vite`/`tsc`, per
  CLAUDE.md known constraint) or re-confirmed on a real phone — ask the user
  to reload on their Android device and confirm the FAB no longer covers the
  last row/button on any screen, Dashboard category names show in full, and
  labels read larger.
- Fixed zero-budget category label on Dashboard "Budget vs actual" tiles and
  Spending category rows: when `budgeted === 0` and actual spend is positive,
  the label now reads "$X spent" (destructive color) instead of the confusing
  "$-X left". Updated `src/routes/app.index.tsx` and
  `src/routes/app.spending.tsx`.
- Not yet build-verified (Windows AppLocker blocks local `vite`/`tsc`).
- Budget split lines (Dashboard "Budget vs actual" + Monthly Summary, Spending
  screen) now label themselves: added a "Paid / due · tap a line for detail"
  caption, bills/debts rows read paid/due (denominator floored at the paid
  amount, so a fully-paid bill no longer shows "$7.33 / $0.00"), and each row
  is tappable to reveal total due/budgeted, total paid/spent, remaining/
  available, and pending for the pay period. `src/components/BudgetSplitLines.tsx`.
- Pay-period budget math now separates cleared from pending: `budgetChart` in
  `src/routes/app.index.tsx` computes actuals from cleared transactions only
  and carries pending per split (spending/bills/debts) for the new detail rows.
- New shared `budgetRingColor()` in `src/components/viz.tsx` replaces the
  rotating palette on budget rings: green under 80%, amber 80-99%, blue at
  exactly 100% (new `--budget-complete` token in `src/styles.css`, light+dark),
  destructive/orange when over or when spend exists with no budget. Applied to
  Dashboard budget tiles, Monthly Summary tiles, and Spending category rows.
  Presentation only; no schema/ADR change.
  - Follow-up: the group-level ring used the same zero denominator (a fully
    paid bill leaves the "due this period" scan), so a category whose only
    activity was a paid bill rendered orange/100%. `budgetChart` now floors
    each category's bills/debts expected amount at the amount actually paid,
    so paid-in-full reads blue (exactly 100%).
- Split-line bars now use the shared `budgetRingColor()` (green/amber/blue/orange)
  instead of a flat brand blue, so an over-spent line reads orange and a partly
  paid line reads green/amber rather than "complete" blue. Over-detection also
   covers the zero-denominator case (spend with no budget). Presentation only;
   `src/components/BudgetSplitLines.tsx`.
- Budget split-line progress bars now render pending amounts as a yellow/amber
  segment at the end of the filled bar (`ItemBar` in `src/components/viz.tsx`).
  Cleared spending/bills/debts use the existing budget-state colour, while any
  pending portion is shown in `var(--state-pending)` so it is visible without
  tapping the detail row. `src/components/BudgetSplitLines.tsx` wires pending
  percentages into each split row.

