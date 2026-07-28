## Schema Rules

- Use UUID primary keys.
- Use created_at and updated_at timestamps.
- Every household table requires household_id.
- Enable RLS on household data.
- Use migrations carefully through Supabase SQL Editor.

## Forbidden
- Password columns
- Duplicate ledger sources
- Hidden business logic in UI only

## Naming
Use descriptive snake_case names.