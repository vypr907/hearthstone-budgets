## ADR-030: Institution Logo Field

Decision:
Add `institutions.logo_url text` (nullable). Auto-populate on institution
create/edit by deriving a favicon URL from the institution's existing
`login_url` domain via Google's public favicon service
(`https://www.google.com/s2/favicons?domain={domain}&sz=128`) — no API key,
no signup, no rate-limit concerns for a 2-person app's request volume.
User can override with a manually pasted `logo_url` at any time.

Reason:
Clearbit's free Logo API (the common go-to for this) was permanently shut
down December 8, 2025 — no longer usable. Paid alternatives (logo.dev,
Brandfetch) require API key management and signup for what's a cosmetic,
low-stakes feature in a private household app. Google's favicon endpoint is
lower-resolution (16-128px, not a full vector logo) but requires zero setup
and has no usage limits relevant here. If visual quality proves unsatisfying
later, this can be swapped for a keyed service without a schema change —
logo_url stays a plain URL string either way.

Status: Decided 2026-08-03. Implemented 2026-08-03 (institution form logo_url
field pre-filled with the derived favicon URL as a visible, editable suggestion;
list/detail render the logo with an institution-type icon fallback on null or
image load error; institution_type is title-cased for display via a code-side
lookup map; Institutions gained a UI-only Group by (type/category) control and
linked Bills/Debts sections in detail).

