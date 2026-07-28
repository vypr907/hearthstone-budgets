## Authentication

Supabase Auth manages user identity.

## Authorization

Row Level Security limits access.

Users access data only when:

is_household_member(household_id)

returns true.

## Model

Two authenticated users:
- same household
- same financial visibility
- different login credentials