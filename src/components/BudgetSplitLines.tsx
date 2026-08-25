import { useState } from "react";
import { ItemBar, budgetRingColor } from "@/components/viz";
import { formatMoney } from "@/lib/format";

/**
 * Expanded budget breakdown: one labelled progress bar per split
 * (spending vs. bills vs. debts), plus an optional extra stat line.
 * ADR-029 visual conventions.
 *
 * Spending reads "spent / budgeted"; bills and debts read "paid / due",
 * where "due" is the period's real obligation total — already-paid
 * obligations drop out of the due-date scan, so the paid amount itself is
 * the floor for the denominator (otherwise a fully paid bill would show
 * "$7.33 / $0.00").
 *
 * Tapping a row reveals the per-line figures: total, paid/spent,
 * remaining/available, and pending.
 */
export function BudgetSplitLines({
  spendingBudgeted,
  billsBudgeted,
  spendingSpent,
  billsSpent,
  debtsBudgeted,
  debtsSpent,
  spendingPending,
  billsPending,
  debtsPending,
  extra,
}: {
  spendingBudgeted: number;
  billsBudgeted: number;
  spendingSpent: number;
  billsSpent: number;
  /** ADR-073: omitted by callers that don't track debts in this breakdown. */
  debtsBudgeted?: number;
  debtsSpent?: number;
  /** Omitted by callers that don't separate pending from cleared. */
  spendingPending?: number;
  billsPending?: number;
  debtsPending?: number;
  extra?: { label: string; value: number };
}) {
  const rows = [
    {
      icon: "🛒",
      label: "Spending",
      spent: spendingSpent,
      total: spendingBudgeted,
      pending: spendingPending,
      spentWord: "spent",
      totalWord: "budgeted",
      remainingWord: "available",
    },
    {
      icon: "🧾",
      label: "Bills",
      spent: billsSpent,
      total: Math.max(billsBudgeted, billsSpent),
      pending: billsPending,
      spentWord: "paid",
      totalWord: "due",
      remainingWord: "remaining",
    },
    ...(debtsBudgeted != null || debtsSpent != null
      ? [
          {
            icon: "🏦",
            label: "Debts",
            spent: debtsSpent ?? 0,
            total: Math.max(debtsBudgeted ?? 0, debtsSpent ?? 0),
            pending: debtsPending,
            spentWord: "paid",
            totalWord: "due",
            remainingWord: "remaining",
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Paid / due · tap a line for detail
      </p>
      {rows.map((r) => (
        <SplitRow key={r.label} {...r} />
      ))}
      {extra ? (
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {extra.label} {formatMoney(extra.value)}
        </p>
      ) : null}
    </div>
  );
}

function SplitRow({
  icon,
  label,
  spent,
  total,
  pending,
  spentWord,
  totalWord,
  remainingWord,
}: {
  icon: string;
  label: string;
  spent: number;
  total: number;
  pending?: number;
  spentWord: string;
  totalWord: string;
  remainingWord: string;
}) {
  const [open, setOpen] = useState(false);
  const over = total > 0 && spent > total;
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : spent > 0 ? 100 : 0;
  const remaining = Math.max(0, total - spent);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }
      }}
      className="rounded-lg py-0.5"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>
          {icon} {label}
        </span>
        <span className={over ? "font-bold text-destructive" : "font-bold text-foreground"}>
          {formatMoney(spent)} / {formatMoney(total)}
        </span>
      </div>
      <ItemBar className="mt-1" value={pct} color={budgetRingColor(spent, total)} />
      {open ? (
        <dl className="mt-1.5 space-y-0.5 rounded-lg bg-muted/50 p-2 text-[11px] tabular-nums text-muted-foreground">
          <Line term={`Total ${totalWord} this period`} value={total} />
          <Line term={`Total ${spentWord} this period`} value={spent} />
          <Line
            term={`Total ${remainingWord} this period`}
            value={remaining}
            emphasis={over ? "over" : undefined}
          />
          {pending != null ? <Line term="Pending this period" value={pending} /> : null}
        </dl>
      ) : null}
    </div>
  );
}

function Line({
  term,
  value,
  emphasis,
}: {
  term: string;
  value: number;
  emphasis?: "over";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{term}</dt>
      <dd className={emphasis === "over" ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
        {formatMoney(value)}
      </dd>
    </div>
  );
}
