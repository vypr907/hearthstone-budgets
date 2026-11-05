## ADR-106: Institution Links, Per-Member Accounts, Institution Parent/Child, Bill Active Toggle

Decision:
Four related additions to how institutions/bills/debts model real-world
complexity, interviewed and decided together (surfaced while setting up
"Yukon Eye" and noticing Amazon/Prime were unrelated institutions):

1. **Multiple links per institution** (`institution_links`: `id,
   institution_id, kind, label, url, sort_order, created_at,
   updated_at`). `institutions.login_url` stays exactly as-is ("Main
   site"); this table only holds *additional* named links. `kind` is a
   DB-checked enum (`bill_pay` / `patient_portal` / `other`) rather than
   free text, because the Log In button and the Patient-Portal-for-medical
   gating both need to find "the" link of a given kind reliably — free
   text label matching would be fragile. No `household_id` column;
   scoped through `institution_id`, same as `institution_categories`
   already does. `InstitutionLoginButton` now opens
   `links.find(l => l.kind === "bill_pay")?.url ?? institution.login_url`
   (falls back to the main site when no Bill Pay link is set) and renders
   one additional button per other stored link (Patient Portal, any
   custom "Other" links). "Patient Portal" is only offered as a kind
   choice in the institution form when `institution_type === "medical"`
   — UI-side gating only, not a DB constraint (matches how other
   type-gated UI already works here).
2. **Per-member accounts at an institution**
   (`institution_member_accounts`: `id, institution_id, member_id,
   account_number, login_username, notes, created_at, updated_at`,
   unique `(institution_id, member_id)`) — for providers that bill each
   spouse separately (vs. providers that combine visits into one joint
   invoice, which need no new concept at all). `bills` and `debts` each
   gain a nullable `institution_member_account_id` FK, coexisting with
   the existing (unchanged, still required) `institution_id` — an
   optional overlay, same shape as `accounts.owner_member_id` (ADR-088),
   not a replacement of the institution relationship.
3. **Institution parent/child** (`institutions.parent_institution_id`,
   nullable, `on delete set null`) — so Prime/Kindle/Audible can be
   marked as part of Amazon without merging their existing data. Kept to
   2 levels (parent + children, no grandchildren) by only offering
   institutions with no parent of their own as parent choices in the
   form — no recursive-chain validation needed. `computeInstitutionTotals`
   (`src/lib/balances.ts`) now takes the full `institutions` list so a
   parent's total includes every child's accounts/bills/debts alongside
   its own. Child institutions drop out of the top-level Institutions
   list (their money is now counted under the parent — showing both
   would double-count any grand total) but stay fully reachable via the
   parent's detail view and via any bill/debt that still names its real
   institution directly.
4. **Bill active/inactive toggle** — `bills.is_active` already existed
   in the database and was already read in 4 places
   (`computeInstitutionTotals`, `paycheck-budget.ts`, `snapshot.ts`,
   `spending-actuals.ts`) but had no write path anywhere. Added a
   `Switch` to `BillDialog`, copying `AutoTransferDialog`'s existing
   "Active" pattern exactly (including the list row's `opacity-60`
   dim-when-inactive treatment, already established there). A plain
   boolean was kept rather than adding a paused/cancelled/active
   three-state enum — nothing downstream needs to distinguish "paused,
   will resume" from "cancelled for good" today.

Reason:
Each gap was blocking a real, current use case (Yukon Eye's separate
Bill Pay/Patient Portal sites, spouses' separate invoices at shared
providers, Amazon's family of sub-institutions, and a bill that's
actually been cancelled still counting toward totals). All four were
interviewed and scoped to the smallest structure that solves the real
case in front of us rather than a maximally general one: a fixed 3-kind
enum instead of arbitrary link types, a flat member-account overlay
instead of a deeper ownership model, 2-level parent/child instead of
arbitrary nesting, and a boolean instead of a status enum. `bills`/
`debts` already supported many-to-one against `institutions` in
practice (`computeInstitutionTotals` already `.filter()`s, never
`.find()`s), so the member-account and parent/child additions extend an
existing shape rather than introducing a new one.

Status: Decided 2026-09-16. Implemented 2026-09-16.

ADR-106 addendum (2026-09-17) — merge over parent/child; member-primary
detail grouping:

Decision:
First real use of ADR-106 surfaced two refinements, both interviewed with
the user rather than assumed:

1. **Merge a split-by-spouse institution into one, don't parent/child it.**
   The user had 3 real institutions modeled as duplicate pairs (Labcorp,
   Alpine Medical, Planet Fitness, each split "- Steven"/"- Stephanie" or
   "- Me"/"- You") purely because there was previously no other way to
   represent per-spouse billing. Checked live: within every pair,
   `login_url`/`logo_url`/`description`/`notes` were identical — the only
   difference was `login_username`, exactly what
   `institution_member_accounts.login_username` now holds. Rather than
   using the new parent/child rollup for this case, each pair is merged
   into a single institution (`scripts/migrations/2026-09-17-merge-split-institutions.sql`):
   two new `institution_member_accounts` rows (Steven/Stephanie) under the
   surviving institution id, every existing bill/debt re-pointed/tagged to
   it, every `transactions.institution_id` "place" reference re-pointed
   too (the losing institution otherwise can't be deleted — a live FK),
   the losing institution deleted. Parent/child stays reserved for
   genuinely distinct institutions that happen to be commercially related
   (Amazon/Prime) — not a second way to express "this is the same place,
   split by who it belongs to," which member-tagging already owns.
2. **Institution detail's member grouping is member-primary, not
   kind-primary.** The original ADR-106 implementation grouped *within*
   separate "Bills" and "Debts" sections by member, with no subtotal. The
   user's actual want was the reverse: one section per person, their
   bills and debts together, one combined total — e.g. Alpine Medical
   showing a "Steven" section (his bills + debts + total) and a
   "Stephanie" section (hers). `InstitutionDetail`
   (`src/routes/app.institutions.tsx`) restructured accordingly for any
   institution with 2+ member accounts; an institution with 0-1 stays on
   the original flat Bills/Debts layout, unchanged.

Reason:
Both gaps only became visible once ADR-106 met real data. The merge
question mattered because two competing "whose is this" mechanisms
(parent/child and member-tagging) solving the same problem for different
institutions would be a lasting inconsistency, not a one-time cost — worth
fixing before any more institutions are set up either way. The grouping
shape came directly from the user's own description of what they needed
to see, not a guess.

Status: Decided 2026-09-17. Implemented 2026-09-17.

ADR-106 addendum (2026-09-17b) — Log In URL priority: bill_pay > patient_portal > login_url:

Decision:
`InstitutionLoginButton`'s "Log In" now opens the first URL found in
`links.find(bill_pay) -> links.find(patient_portal) -> institution.login_url`,
amending the original bill_pay-then-login_url order from earlier the same
day. Whichever link "Log In" ends up using is no longer also offered as its
own extra button (previously only `bill_pay` was excluded from the extra-
links row; now `patient_portal` is excluded too, but only when it's actually
serving as the login target — if a `bill_pay` link is also set, Patient
Portal still gets shown as its own separate button).

Reason:
Alpine Medical has no dedicated bill-pay link; its billing lives inside its
Patient Portal. Falling straight through to the generic "Main site" login
for Log In was wrong for that case — Patient Portal is a more specific,
still-generic-enough (not per-member) destination than the main site, so it
belongs ahead of it in the fallback order.

Status: Decided 2026-09-17. Implemented 2026-09-17.

