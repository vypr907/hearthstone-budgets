# Theme Tokens (ADR-061)

Every themed CSS variable is defined in `src/styles.css` under `:root` and
overridden per theme in `[data-theme="…"]` blocks. `ThemeProvider`
(`src/lib/theme.tsx`) sets `document.documentElement.dataset.theme` from
`household_members.theme`.

Rule: components must consume tokens (Tailwind semantic classes or
`var(--token)`), never hardcoded colors.

## Color tokens

| Token | Tailwind class | Consumers |
| --- | --- | --- |
| `--background` | `bg-background` | page/app shell background |
| `--foreground` | `text-foreground` | default body text |
| `--card` / `--card-foreground` | `bg-card`, `text-card-foreground` | all `Card` surfaces (dashboard, lists, detail) |
| `--popover` / `--popover-foreground` | `bg-popover` | dialogs, dropdowns, selects, sheets |
| `--primary` / `--primary-foreground` | `bg-primary`, `border-primary` | primary buttons, selected theme swatch border, active toggles |
| `--secondary` / `--secondary-foreground` | `bg-secondary` | secondary buttons, chips |
| `--muted` / `--muted-foreground` | `bg-muted`, `text-muted-foreground` | section labels, helper text, empty states, skeletons |
| `--accent` / `--accent-foreground` | `bg-accent` | hover/active list rows, menu items |
| `--destructive` / `--destructive-foreground` | `bg-destructive`, `text-destructive` | delete actions, overdue/past-due badges |
| `--border` | `border-border` | dividers, card and input borders |
| `--input` | `border-input` | form input borders |
| `--ring` | `ring-ring` | focus rings |
| `--brand` / `--brand-foreground` | `bg-brand`, `text-brand` | dashboard hero card, active bottom-nav chip |
| `--state-pending` | `bg-state-pending` | pending payment badges (ADR-036) |
| `--state-partial` | `bg-state-partial` | partial payment badges (ADR-036) |
| `--state-cleared` | `bg-state-cleared` | cleared payment badges (ADR-036) |
| `--item-1` … `--item-6` | `bg-item-*` | category/institution color palette (`src/lib/visual-meta.ts`), spending bars |
| `--chart-1` … `--chart-5` | `bg-chart-*` | charts in `src/components/viz.tsx` |

## Non-color tokens

| Token | Consumers |
| --- | --- |
| `--gradient-brand` | dashboard hero card background |
| `--shadow-card` | card elevation |
| `--radius` (+ `-sm`/`-md`/`-lg`/`-xl`…) | corner radii across UI |

## Live reference

Settings → "Theme token reference" renders every token above as a swatch with
its computed value under the active theme (`src/components/ThemeTokenPreview.tsx`).
Read-only; editing tokens is out of scope.
