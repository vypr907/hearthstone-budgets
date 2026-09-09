-- 2026-09-09 — Widen institutions_institution_type_check to allow the 13 new
-- ADR-099 institution_type values.
--
-- Correction: ADR-099 (and the InstitutionDialog.tsx comment it was based
-- on) assumed institution_type had no DB-level constraint — verified live to
-- be wrong. A real check constraint exists, scoped to exactly the original 9
-- values (bank, credit_card, lendor_lessor, financial, tool, medical,
-- utility, subscription, other). Discovered when
-- 2026-09-09-institution-type-reclass.sql failed on its very first UPDATE
-- with "violates check constraint institutions_institution_type_check" — the
-- whole migration's transaction rolled back cleanly, so no partial
-- reclassification happened; confirmed via MCP (0 rows outside the original
-- 9 values before this fix).
--
-- Run this BEFORE (re-)running 2026-09-09-institution-type-reclass.sql.

begin;

alter table public.institutions drop constraint institutions_institution_type_check;

alter table public.institutions add constraint institutions_institution_type_check
  check (institution_type = any (array[
    'bank', 'credit_card', 'lendor_lessor', 'financial', 'tool', 'medical',
    'utility', 'subscription',
    'restaurant', 'grocery_store', 'gas_station', 'liquor_store',
    'department_store', 'specialty_store', 'venue', 'game', 'app',
    'dispensary', 'personal_care', 'employer', 'delivery',
    'other'
  ]::text[]));

commit;
