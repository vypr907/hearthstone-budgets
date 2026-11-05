## ADR-105: Cross-Entity Navigation via `?open=<id>` Search Params; Global Dialogs Gain External Presets

Decision:
Two small, related conventions, both new to this app (SCRATCHPAD "Next
Steps"):

1. **Deep-linking to another route's detail dialog.** A route that owns a
   detail dialog (so far: `/app/accounts`, `/app/debts`) declares
   `validateSearch` returning `{ open?: string }` (an entity id). On mount,
   an effect looks up that id in the already-loaded list and opens the
   dialog exactly as a card-tap would, then immediately clears the param
   via `navigate({ search: {}, replace: true })` so back/refresh doesn't
   re-trigger it. A caller anywhere else navigates via
   `navigate({ to: "/app/accounts", search: { open: accountId } })`. No
   route previously had `validateSearch`/`useSearch` at all — every
   "detail" view before this was a local `useState` + `Dialog` scoped to
   its own route file with no way to reach it from elsewhere. First use:
   a linked credit-card debt's "Account" field and an account's reverse
   "Linked debt" field are now clickable, navigating each direction.
2. **A global singleton dialog accepting an external preset.**
   `AddTransactionFab` (mounted once in `app.tsx`, used app-wide) had no
   way to be pre-filled — opening it from an Account or Institution detail
   required closing that dialog and manually reselecting the account/place
   in the Add Transaction form. `AddTransactionPresetProvider`
   (`src/components/AddTransactionPreset.tsx`) wraps the app shell and
   owns the FAB's open state plus an optional `{ accountId?,
   institutionId? }` preset; `useAddTransactionPreset().openWithPreset(...)`
   lets any component reachable inside the provider open it pre-filled.
   `AddTransactionFab` seeds `accountId`/`merchantId` from the preset in an
   effect keyed on `open`, on top of its existing `reset()` defaults.

Reason:
Both are the first instance of a real need this app hadn't hit before —
jumping to a specific other entity's detail, and pre-filling a
globally-mounted dialog from a page it isn't rendered on. Search params are
the natural TanStack Router mechanism for "this route, but with one thing
already open" (doesn't fight the router's own history/back behavior the
way an ad-hoc global "which dialog is open" store would); a lightweight
context is the natural mechanism for a true singleton that already lives
above every route (a route-level solution can't reach a component mounted
once in the shared shell). Documented so a third cross-entity link (there
will be more) reuses the `open=` convention instead of inventing another
one, and so another globally-mounted dialog reuses the preset-context shape
instead of hand-rolling props-drilling that can't reach it from a
different route.

Also fixed alongside this: `DebtDetailDialog`'s "Account" field was
resolving the shown account by matching `institution_id`, not the actual
`linked_account_id` (ADR-102) — harmless before a credit-card debt could
be linked, silently wrong once it could be. Now resolves via
`linked_account_id` first, falling back to the old `institution_id` match
only for a debt that isn't linked.

Status: Decided 2026-09-16. Implemented 2026-09-16.

Addendum 2026-11-05: `/app/bills` is the anticipated "third cross-entity
link" — it now has the identical `validateSearch`/mount-effect pair
`/app/debts` already had, so `BillRow`/`DebtRow` inside Institution detail
(`app.institutions.tsx`) can navigate to `/app/bills?open=<id>` or
`/app/debts?open=<id>` and open the right detail dialog, regardless of
whether that bill/debt is currently filtered out of Everything/the Debts
list elsewhere (Institution detail's own linked-bills/debts list is never
filtered by paid-off/active status, by design).

