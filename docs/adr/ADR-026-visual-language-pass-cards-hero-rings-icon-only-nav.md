## ADR-026: Visual language pass (cards, hero, rings, icon-only nav)
Decision: Adopt a soft-neutral background with white 16px shadowed cards, one
gradient hero card on the Dashboard, ProgressRing/ItemBar/EmojiIcon primitives in
src/components/viz.tsx, bold dollar amounts with small uppercase gray labels, and
an icon-only bottom nav whose active tab uses a filled rounded chip.
Reason: Match the reference screenshots' friendlier, thumb-friendly mobile feel
without touching data fetching, RLS, the pending/cleared ledger flow, or ADR-012.
Status: Decided 2026-08-03. Implemented.

