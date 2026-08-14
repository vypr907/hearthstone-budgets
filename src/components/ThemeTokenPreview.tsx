import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";

/**
 * ADR-061: read-only reference of the themed CSS variables and their computed
 * values under the currently active theme. Debugging aid only — no editing.
 */
const COLOR_TOKENS: { name: string; usedBy: string }[] = [
  { name: "--background", usedBy: "page background" },
  { name: "--foreground", usedBy: "default text" },
  { name: "--card", usedBy: "card surfaces" },
  { name: "--card-foreground", usedBy: "card text" },
  { name: "--popover", usedBy: "dialogs, dropdowns" },
  { name: "--popover-foreground", usedBy: "dialog text" },
  { name: "--primary", usedBy: "primary buttons, active borders" },
  { name: "--primary-foreground", usedBy: "primary button text" },
  { name: "--secondary", usedBy: "secondary buttons, chips" },
  { name: "--secondary-foreground", usedBy: "secondary button text" },
  { name: "--muted", usedBy: "muted surfaces, skeletons" },
  { name: "--muted-foreground", usedBy: "labels, helper text" },
  { name: "--accent", usedBy: "hover states, list highlights" },
  { name: "--accent-foreground", usedBy: "hover state text" },
  { name: "--destructive", usedBy: "delete actions, overdue" },
  { name: "--destructive-foreground", usedBy: "destructive text" },
  { name: "--border", usedBy: "borders, dividers" },
  { name: "--input", usedBy: "input borders" },
  { name: "--ring", usedBy: "focus rings" },
  { name: "--brand", usedBy: "hero card, active nav chip" },
  { name: "--brand-foreground", usedBy: "text on brand" },
  { name: "--state-pending", usedBy: "pending payment badges" },
  { name: "--state-partial", usedBy: "partial payment badges" },
  { name: "--state-cleared", usedBy: "cleared payment badges" },
  { name: "--item-1", usedBy: "category/item color 1" },
  { name: "--item-2", usedBy: "category/item color 2" },
  { name: "--item-3", usedBy: "category/item color 3" },
  { name: "--item-4", usedBy: "category/item color 4" },
  { name: "--item-5", usedBy: "category/item color 5" },
  { name: "--item-6", usedBy: "category/item color 6" },
  { name: "--chart-1", usedBy: "charts" },
  { name: "--chart-2", usedBy: "charts" },
  { name: "--chart-3", usedBy: "charts" },
  { name: "--chart-4", usedBy: "charts" },
  { name: "--chart-5", usedBy: "charts" },
];

const OTHER_TOKENS: { name: string; usedBy: string }[] = [
  { name: "--gradient-brand", usedBy: "hero card gradient" },
  { name: "--shadow-card", usedBy: "card elevation" },
  { name: "--radius", usedBy: "corner radius base" },
];

export function ThemeTokenPreview() {
  const theme = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next: Record<string, string> = {};
    for (const t of [...COLOR_TOKENS, ...OTHER_TOKENS]) {
      next[t.name] = cs.getPropertyValue(t.name).trim();
    }
    setValues(next);
  }, [theme]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {COLOR_TOKENS.map((t) => (
          <div key={t.name} className="flex items-center gap-2 rounded-md border p-1.5">
            <span
              className="h-8 w-8 shrink-0 rounded-md border"
              style={{ backgroundColor: `var(${t.name})` }}
            />
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px]">{t.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {values[t.name] || "—"} · {t.usedBy}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {OTHER_TOKENS.map((t) => (
          <div key={t.name} className="rounded-md border p-1.5">
            <div className="font-mono text-[11px]">{t.name}</div>
            <div className="break-all text-[10px] text-muted-foreground">
              {values[t.name] || "—"} · {t.usedBy}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
