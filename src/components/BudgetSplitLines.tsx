import { ItemBar } from "@/components/viz";
import { formatMoney } from "@/lib/format";

/**
 * Expanded budget breakdown: one labelled progress bar per split
 * (spending vs. bills), plus an optional extra stat line.
 * ADR-029 visual conventions.
 */
export function BudgetSplitLines({
  spendingBudgeted,
  billsBudgeted,
  spendingSpent,
  billsSpent,
  extra,
}: {
  spendingBudgeted: number;
  billsBudgeted: number;
  spendingSpent: number;
  billsSpent: number;
  extra?: { label: string; value: number };
}) {
  const rows = [
    { icon: "🛒", label: "Spending", spent: spendingSpent, budgeted: spendingBudgeted },
    { icon: "🧾", label: "Bills", spent: billsSpent, budgeted: billsBudgeted },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const over = r.budgeted > 0 && r.spent > r.budgeted;
        const pct =
          r.budgeted > 0
            ? Math.min(100, (r.spent / r.budgeted) * 100)
            : r.spent > 0
              ? 100
              : 0;
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
              <span>
                {r.icon} {r.label}
              </span>
              <span className={over ? "font-bold text-destructive" : "font-bold text-foreground"}>
                {formatMoney(r.spent)} / {formatMoney(r.budgeted)}
              </span>
            </div>
            <ItemBar
              className="mt-1"
              value={pct}
              color={over ? "var(--destructive)" : undefined}
            />
          </div>
        );
      })}
      {extra ? (
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {extra.label} {formatMoney(extra.value)}
        </p>
      ) : null}
    </div>
  );
}
