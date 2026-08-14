# Theme Token Reference (ADR-061)

Read-only reference. Every token below is defined in `:root` in `src/styles.css`
and re-declared by each `[data-theme="…"]` block (halo, hellokitty, purple_dark,
purple_pastel, cyber_neon, cyber_stealth). `src/lib/theme.tsx` sets
`document.documentElement.dataset.theme`; nothing else switches colors.

Notes:

- `--radius` and the `--radius-*` scale are **not** themed (intentional, ADR-061 v1).
- Most tokens are exposed as Tailwind utilities through the `@theme inline` block
  (`--color-x: var(--x)` → `bg-x` / `text-x` / `border-x`).
- Consumers below come from grepping `src/` for `var(--token)` and the matching
  utility classes. `src/components/ui/*` are shadcn primitives used app-wide.

## Brand / identity

| Token | Consumed by |
| --- | --- |
| `--brand` | Active bottom-nav chip (`BottomNav.tsx`), default series/bar color in `viz.tsx` (`Sparkline` stroke, `Bar` fill), brand-tinted accents across Dashboard |
| `--brand-foreground` | Text and inner chips on the Dashboard hero card (`app.index.tsx`), snapshot hero (`app.snapshot.tsx`) |
| `--gradient-brand` | Dashboard hero card background (`app.index.tsx:374`), Status Snapshot hero band (`app.snapshot.tsx:218`) |
| `--shadow-card` | Every `Card` (`components/ui/card.tsx`), Dashboard hero, all snapshot cards |

## Surfaces and text

| Token | Consumed by |
| --- | --- |
| `--background` | App shell page background (`app.tsx`, `auth.tsx`), dialog/drawer/alert surfaces, snapshot canvas |
| `--foreground` | Default body text; emphasized amounts on Dashboard rows |
| `--card` | Card surfaces, sticky `AppHeader` background |
| `--card-foreground` | Text inside cards |
| `--popover` / `--popover-foreground` | Dropdown, select, command, context-menu, calendar popovers |
| `--muted` | Progress-bar tracks and icon tiles (`viz.tsx`), donut track, subtle row fills |
| `--muted-foreground` | Section labels, helper text, placeholders, inactive nav items |
| `--border` | Card/list dividers, `AppHeader` bottom border, Recharts grid + tooltip border (`app.index.tsx`) |
| `--input` | Input, textarea, select, toggle borders; unchecked `Switch` track |
| `--ring` | Focus rings on all interactive primitives |

## Semantic actions

| Token | Consumed by |
| --- | --- |
| `--primary` / `--primary-foreground` | Default `Button`, auth logo tile, tooltips, selected calendar day, projection line stroke on Dashboard chart |
| `--secondary` / `--secondary-foreground` | Secondary buttons, default `Badge` |
| `--accent` / `--accent-foreground` | Hover/focus states on buttons, select items, menu rows, list controls |
| `--destructive` / `--destructive-foreground` | Overdue/past-due text, delete actions, error copy, snapshot alert rows |

## Payment states (ADR-036)

| Token | Consumed by |
| --- | --- |
| `--state-pending` | Pending clock icon in `ledger-state.ts` → Everything / Bills / Debts / Payment Schedule rows |
| `--state-partial` | Partial pie icon (same consumers) |
| `--state-cleared` | Cleared check icon (same consumers) |

## Categorical palette

| Token | Consumed by |
| --- | --- |
| `--item-1` … `--item-6` | `ITEM_COLORS` in `components/viz.tsx` — category donut slices, spending bars, Spending-by-Place bars, paycheck allocation groups |
| `--chart-1` … `--chart-5` | Recharts series palette in `app.index.tsx` (12-month projection / balance charts) |

## Themed but currently unused

| Token | Notes |
| --- | --- |
| `--sidebar*` (8 tokens) | Only read by the unused shadcn `components/ui/sidebar.tsx`; kept for parity so the primitive never falls back to unthemed colors |

## Live preview

In dev, `/app/settings` renders a read-only swatch list under the Theme picker
(`src/components/ThemeTokenPreview.tsx`) showing each token's computed value for
the active theme. It is a debugging aid — editing/overriding values is out of scope.
