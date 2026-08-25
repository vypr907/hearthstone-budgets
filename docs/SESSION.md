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
