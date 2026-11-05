## ADR-099: Institution Type Taxonomy Expansion + Fix Institution Logins Screen

Decision:
Add 13 new `institution_type` values to the client-side allowed list
(`INSTITUTION_TYPES` in `src/components/InstitutionDialog.tsx` — free text, no DB
constraint): `restaurant`, `grocery_store`, `gas_station`, `liquor_store`,
`department_store`, `specialty_store`, `venue`, `game`, `app`, `dispensary`,
`personal_care`, `employer`, `delivery`. Matching icon/color entries added to
`INSTITUTION_TYPE_META` (`src/lib/visual-meta.ts`). Existing institutions previously
typed `other` (or, for UberEats, `subscription`) are reclassified into these where a
clear match exists — see `scripts/migrations/2026-09-09-institution-type-reclass.sql`
for the full per-institution mapping, decided interactively with the user rather than
guessed. A handful of genuinely ambiguous names (Dept of Education, DFAS, Gavora's,
Lacey Miller, MoneyLion, The Sheet Code) are deliberately left as `other`.

Also adds a new "Fix Institution Logins" screen (`/app/fix-institution-logins`),
grouped alongside the existing "Fix Places" screen (`/app/fix-places`) in the More
page's icon grid (`src/routes/app.more.tsx`) — there is no nested "Fix" submenu, both
just sit in the same flat list. It lists every institution with no `login_url` and lets
the user fix it in place with an inline URL field, same shape as `FixPlacesPage`.

Reason:
`other` had become a catch-all for roughly half the household's ~130 institutions —
restaurants, grocery/gas/liquor stores, apps, a dispensary, a barbershop, an employer,
and delivery platforms were all indistinguishable in filters and reports. `delivery` is
deliberately a business-kind classification, independent of whether a given UberEats
transaction is the household's driving income or its occasional dining spend — that
split is already handled by category/domain and amount sign (ADR-069), not
institution_type, so one type serves both directions cleanly. Institutions missing a
login_url had no dedicated fix flow, unlike the equivalent gap already solved for
transactions without a place (ADR-053/063's Fix Places).

Status: Decided 2026-09-09. Implemented 2026-09-09 (code). Data reclassification SQL
written, pending the user running it manually per ADR-083.

Correction (same day): the reclassification migration failed —
`institutions.institution_type` turned out to be DB-enforced via a check
constraint (`institutions_institution_type_check`), scoped to exactly the
original 9 values. Both this ADR's Decision text above and
`INSTITUTION_TYPES`'s own comment in `InstitutionDialog.tsx` incorrectly
stated there was no DB constraint — never verified against the live schema
before writing the migration, same category of doc drift as ADR-097's
`categories.domain` correction. Fixed with a schema migration,
`scripts/migrations/2026-09-09-institution-type-check-constraint.sql`
(drops and recreates the constraint with all 22 values), which must run
**before** the reclassification migration. The failed reclass attempt's
transaction rolled back cleanly — verified live via MCP that 0 institutions
ended up outside the original 9 values, so no partial/corrupt state resulted.
`docs/SCHEMA.md`'s institutions section updated to document the constraint.

