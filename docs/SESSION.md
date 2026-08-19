## Session Notes

- Bug fix (no ADR — referenced this session's finding, ADR-008 correcting/
  reversal transactions): `deriveCycleInfo()` in `src/lib/ledger-state.ts`
  summed `Math.abs(amount)` across cleared transactions for both `clearedSum`
  and `clearedPrev`, which double-counted an ADR-008 correcting/reversal
  transaction instead of netting it against the original payment it offsets.
  Replaced both with a signed net (`s - Number(t.amount ?? 0)`, floored at 0
  via `Math.max(0, ...)`). Added a regression test in
  `src/lib/ledger-state.test.ts`: a $609 cleared payment followed by a $609
  cleared reversal now nets `clearedSum = 0` and `state = 'unpaid'`, not
  `'cleared'`. Did not touch the `pastDue`/cycle-window filtering logic
  (out of scope). Files touched: `src/lib/ledger-state.ts`,
  `src/lib/ledger-state.test.ts`. Could not run the test suite locally
  (vitest binary blocked by AppLocker, per project constraint) — flagging
  for verification. Next: none outstanding for this task.
