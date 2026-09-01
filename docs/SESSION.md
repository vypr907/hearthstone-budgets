# SESSION.md

- Post-migration verification for the debt payoff-date invariant (ADR-066 addendum).
  Added `scripts/migrations/2026-09-01-enforce-debt-payoff-date.verify.sql` (read-only
  checks: trigger + function installed, no settled non-Advance debt missing
  `date_paid_off`, no open non-Advance debt still carrying one, backfill spot-check,
  Advance rows informational). Unit tests pass (21) and build is clean.
  - Verified live 2026-09-01 via the read-only Supabase MCP. All 6 checks pass:
    trigger installed (`BEFORE INSERT OR UPDATE OF remaining_balance, debt_type,
    date_paid_off`), function present with a body; check 3 = 0 rows, check 4 =
    0 rows; the 12 settled non-Advance debts all carry a plausible payoff date
    (2026-07-31 … 2026-08-27, none defaulted to today); Advance debts untouched.
    Nothing to investigate.
- Detail-screen visual polish (Lovable editor, presentation only — no ADR).
  New shared chips in `src/components/detail.tsx` (`CategoryChip`, `ValueChip`,
  `LogoLabel`, `DetailMoneyStrong`); Bill and Debt detail dialogs
  (`src/routes/app.bills.tsx`, `src/routes/app.debts.tsx`) render Category /
  Institution / Billing cycle / Manual-auto through them, title gained the
  institution logo, "Total owed" is bold. No schema/query/logic change.
  Summarised into docs/CHANGELOG.md (2026-09-01).
- Doc reconciliation for the 2026-09-01 Lovable session.
  - Resolved the duplicate `## ADR-088` in docs/DECISIONS.md: "One Edit for
    linked transactions" renumbered to ADR-091 (header + ~9 code comment refs
    in `src/routes/app.transactions.tsx`, `src/lib/payments.ts`,
    `src/lib/split-groups.ts` + test); ADR-088 (Per-Account Owner) status line
    corrected to "Implemented 2026-08-27 (Issue #36, PR #39)".
  - Brought docs/CONTEXT.md current: status bullets for ADR-088/089/090/091 and
    the detail-screen polish.
  - `npm run typecheck` clean, `npm test` 124 passing (comment-only code edits).
  - Reconciled two committed-but-undocumented migrations, both confirmed applied
    via the Supabase MCP: `2026-09-01-enforce-debt-payoff-date.sql` (ADR-066,
    verified below) and `2026-08-31-aarons-dresser-lease-alignment.sql` (debt
    `8004b659…` now $2,330.40 basis / $1,942.00 remaining / $97.10 payment).
    Wrote **ADR-092** (rent-to-own debts tracked at total cost to own) + a
    CHANGELOG entry under 2026-08-31.
- ADR-093: "Log In" action on institution & debt detail.
  New `src/components/InstitutionLoginButton.tsx` (button + optional
  Google-account hint), wired into `InstitutionDetail` (`app.institutions.tsx`)
  and `DebtDetailDialog` (`app.debts.tsx`) — one `<InstitutionLoginButton>` line
  + import each. Opens `login_url` via `@capacitor/browser` (dynamic import,
  Custom Tab on Android, new-tab fallback on web). Added `@capacitor/core` +
  `@capacitor/browser` — the project's first Capacitor deps; no config/native
  scaffolding (Phase 12). No schema change, no new storage.
  - typecheck clean, build clean, `npm test` 124 passing, lint clean on the new
    file (repo-wide prettier debt untouched — Issue #10). Reverted the unrelated
    `routeTree.gen.ts` import-order churn the build regenerated.
  - Next step: manual check on the dev server (button shows only with a
    login_url; hint only for Google-auth institutions).
