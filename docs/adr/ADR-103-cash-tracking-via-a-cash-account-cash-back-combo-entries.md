## ADR-103: Cash Tracking via a Cash Account + "Cash Back" Combo Entries

Decision:
A blended register swipe — part purchase, part cash back — no longer gets entered as a
same-account category split (which counted the cash-back portion as spend the moment it
was withdrawn). Instead:
- Each household member gets their own `accounts` row, `account_type = 'cash'`, no
  institution, `owner_member_id` set to that member (not joint) — plain data, no schema
  change (`account_type` carries no DB check constraint, unlike `institution_type`,
  ADR-099).
- A new "Cash Back" entry mode (`AddTransactionFab.tsx`) writes: (1) a normal ADR-056
  transfer pair (checking `-cashAmount` / Cash `+cashAmount`, `transfer_group_id =
  groupId`), and (2) one or more categorized purchase rows on the checking account,
  `split_group_id = groupId` — the same id as the transfer. This generalizes ADR-097's
  single fixed-category fee row to N caller-categorized lines (`insertCashBackPurchaseRows`
  in `payments.ts`, a sibling of `insertFeeTransaction`); `useSaveCashBack` in
  `data-hooks.ts` writes both parts. A pure cash withdrawal (no purchase attached) needs
  no new code — it's already just a plain Transfer.
- `classifyLedgerGroup`/`isCategorySplitGroup` (`split-groups.ts`) take a new
  `transferGroupIds` set; a `split_group_id` that is also some transfer's
  `transfer_group_id` classifies as `"cash-back-purchase"`, never `"category-split"` —
  otherwise a 2+-line purchase would wrongly open the whole-group split editor, which
  doesn't know about the paired transfer. Falling through to the plain per-row editor
  means the existing `linkedTransferLeg` lookup (already used for fee rows) shows the
  "part of a transfer" banner for free — no new detail-view UI needed.
- `useDeleteTransferPair` now deletes every row sharing the transfer's group id via
  either column (`split_group_id` or `transfer_group_id`) instead of only rows matching
  `description ILIKE 'Fee:%'` — a plain superset, since a transfer's `transfer_group_id`
  is only ever handed to `insertFeeTransaction` or `insertCashBackPurchaseRows`, never to
  a bill/debt payment+fee group (those use their own, unrelated group id).
- `balances.ts`'s `SPENDABLE_TYPES` gains `"cash"` — found live, no `cash`-type account
  existed yet, but the allowlist would have silently excluded one from the spendable-money
  total despite `is_spendable = true`.
- No reconciliation/"count my cash" feature: the Cash account balance is just
  `starting_balance + transactions`, same as every other account. Drift from untracked
  cash spending is tolerated for now.
- The pre-existing "Cash & Checks" category (2 transactions, $60 total, 2026-07-02) is
  retired for new entries; those 2 rows are left as-is (Issue to follow for migrating
  them). "Checks" as a concept is untouched — a different timing problem, out of scope.

Reason:
The user's own example: buy a snack at Fred's, get $100 cash back in the same swipe,
entered as a split with the cash portion categorized "Cash & Checks" — counted as $100
of spend immediately. Later spending that cash (e.g. $50 on weed, $50 on a movie), logged
as its own categorized transaction, counted the same $100 again. Giving cash a real
account turns the withdrawal into a transfer (excluded from spend by the existing
ADR-089 `internalTransferIds` logic, no change needed there) and the later spending into
an ordinary transaction that counts once. A dedicated combo entry (rather than teaching
the generic split editor to target a second account) keeps the existing
one-account-per-split-group invariant intact — `assertCategorySplitGroup`'s guard and the
whole-group edit/delete path are unchanged.

Verified live via the read-only Supabase MCP (project `ilxwhgqudcxsgxrvxhtb`) before
building: no `cash`-type account existed yet; `account_type` has no DB check constraint;
"Cash & Checks" is a real `spending`-domain category with exactly 2 transactions.

Not covered: no bespoke "edit the whole Cash Back entry as one form" UI — each row (2
transfer legs + N purchase lines) is edited individually through the existing per-row
editor, same as a transfer's optional fee already works. The main ledger list still badges
a multi-line Cash Back purchase as a generic "Split · N categories" card (only the detail
view's editor routing was fixed) — cosmetic, not a follow-up Issue yet.

Status: Decided 2026-09-13. Implemented 2026-09-13.


