-- ADR-113: add 'person' to institutions_institution_type_check so a friend
-- or family member who fronts money (covers a bill, loans cash) can be
-- recorded as an ordinary institution, reusing the existing
-- institutions/debts machinery instead of a parallel system.
--
-- Same drop/recreate-constraint pattern as
-- 2026-09-09-institution-type-check-constraint.sql.

begin;

alter table public.institutions drop constraint institutions_institution_type_check;

alter table public.institutions add constraint institutions_institution_type_check
  check (institution_type = any (array[
    'bank', 'credit_card', 'lendor_lessor', 'financial', 'tool', 'medical',
    'utility', 'subscription',
    'restaurant', 'grocery_store', 'gas_station', 'liquor_store',
    'department_store', 'specialty_store', 'venue', 'game', 'app',
    'dispensary', 'personal_care', 'employer', 'delivery',
    'person',
    'other'
  ]::text[]));

commit;
