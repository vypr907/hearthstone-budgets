## ADR-052: Invoice number field and auto-composed invoice names
Decision: Debts gain `invoice_number`. When the type is Invoice and the name has
not been typed by hand, the name auto-composes as "<Institution> - <Invoice
number>" and updates as either input changes. Typing in the name field (or
editing an existing debt) stops auto-naming permanently.

Reason: Invoices are identified by issuer + number; typing that twice is busywork,
but the name must still be freely editable.

Status: Decided 2026-08-11. Implemented.

