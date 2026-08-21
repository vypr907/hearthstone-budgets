## Session Notes

- ADR-075: user ran the `resolved_cycle_due_date` migration in the Supabase
  SQL Editor. Verified live via the read-only MCP (`list_tables`) —
  `public.transactions.resolved_cycle_due_date` exists (nullable date). The
  fix is now fully active going forward. Updated ADR-075's status line,
  removed the now-done TODO item, and dropped "pending" from CONTEXT.md's
  Phase 11 bullet.
  - Next step: smoke-test — pay a bill one day late and confirm the next
    cycle shows Submit, not Reset.
