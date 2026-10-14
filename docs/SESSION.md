# SESSION.md

## Session Notes

- 2026-10-13: Dave ExtraCash — restored "Record advance"/"Add adjustment"
  buttons for linked `debt_type='advance'` debts (narrowed the ADR-102
  2026-09-15 "hidden once linked" gate to non-advance debts), and added a
  new per-advance episode history view replacing the flat Advances list
  (new ADR-111). New `src/lib/debt-episodes.ts` (`computeAdvanceEpisodes`)
  + `src/lib/debt-episodes.test.ts` (13 tests); `src/routes/app.debts.tsx`
  updated (`DebtAdjustments`, new `AdvanceEpisodeCard`). ADR-102 addendum +
  ADR-111 written to docs/DECISIONS.md. `tsc --noEmit` clean, 268/268 tests
  pass.
  - 2026-10-14: Step 0 SQL fix run by user (deleted duplicate untagged
    $15 transfer, ids `99a1fa59-65bc-4a16-b6eb-cf4e41a2074d` and
    `15651294-dc8c-4ce0-b175-58ffea0cf275`) — confirmed gone via the
    read-only MCP. Dave ExtraCash's balance now correctly reads $40.00.
  - Not yet verified in a running browser (sandbox can't reach `npm run
    dev`'s port) — needs a Codespace or real device pass to confirm the
    restored button, updated copy, and new episode cards render/expand
    correctly.
