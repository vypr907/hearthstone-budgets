import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

/**
 * ADR-061 debugging aid: read-only swatch list of every token the theme system
 * overrides, with its computed value for the active theme. Descriptions mirror
 * docs/THEME_TOKENS.md. Dev-only; no editing or saving here by design.
 */
const TOKENS: { name: string; what: string }[] = [
  { name: "--brand", what: "Active nav chip, default chart/bar color" },
  { name: "--brand-foreground", what: "Text and chips on the hero cards" },
  { name: "--gradient-brand", what: "Dashboard + snapshot hero background" },
  { name: "--shadow-card", what: "Elevation on every card" },
  { name: "--background", what: "Page background behind all screens" },
  { name: "--foreground", what: "Default body text" },
  { name: "--card", what: "Card and header surfaces" },
  { name: "--card-foreground", what: "Text inside cards" },
  { name: "--popover", what: "Dropdown / select / menu surface" },
  { name: "--popover-foreground", what: "Text inside popovers" },
  { name: "--muted", what: "Progress tracks, icon tiles" },
  { name: "--muted-foreground", what: "Labels, helper text, inactive nav" },
  { name: "--border", what: "Dividers, card borders, chart grid" },
  { name: "--input", what: "Field borders, switch track" },
  { name: "--ring", what: "Focus rings" },
  { name: "--primary", what: "Default buttons, tooltips" },
  { name: "--primary-foreground", what: "Text on primary buttons" },
  { name: "--secondary", what: "Secondary buttons, badges" },
  { name: "--secondary-foreground", what: "Text on secondary surfaces" },
  { name: "--accent", what: "Hover / focus states" },
  { name: "--accent-foreground", what: "Text on hovered rows" },
  { name: "--destructive", what: "Overdue amounts, delete actions" },
  { name: "--destructive-foreground", what: "Text on destructive fills" },
  { name: "--state-pending", what: "Pending payment icon" },
  { name: "--state-partial", what: "Partial payment icon" },
  { name: "--state-cleared", what: "Cleared payment icon" },
  { name: "--item-1", what: "Category palette slot 1" },
  { name: "--item-2", what: "Category palette slot 2" },
  { name: "--item-3", what: "Category palette slot 3" },
  { name: "--item-4", what: "Category palette slot 4" },
  { name: "--item-5", what: "Category palette slot 5" },
  { name: "--item-6", what: "Category palette slot 6" },
  { name: "--chart-1", what: "Recharts series 1" },
  { name: "--chart-2", what: "Recharts series 2" },
  { name: "--chart-3", what: "Recharts series 3" },
  { name: "--chart-4", what: "Recharts series 4" },
  { name: "--chart-5", what: "Recharts series 5" },
];

export function ThemeTokenPreview() {
  const theme = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const t of TOKENS) next[t.name] = cs.getPropertyValue(t.name).trim();
    setValues(next);
  }, [theme]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Dev-only reference for <span className="font-mono">data-theme="{theme}"</span>. See
        docs/THEME_TOKENS.md.
      </p>
      <div className="divide-y divide-border/60 rounded-md border">
        {TOKENS.map((t) => {
          const value = values[t.name] ?? "";
          const isPaint = t.name !== "--shadow-card";
          return (
            <div key={t.name} className="flex items-center gap-3 px-2 py-2">
              <span
                className="h-8 w-8 shrink-0 rounded-md border border-border"
                style={
                  isPaint
                    ? { background: value || "transparent" }
                    : { background: "var(--card)", boxShadow: value }
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] font-medium">{t.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t.what}</p>
              </div>
              <p className="max-w-[40%] truncate font-mono text-[10px] text-muted-foreground">
                {value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
