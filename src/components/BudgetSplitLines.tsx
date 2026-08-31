import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { ItemBar, budgetRingColor } from "@/components/viz";
import { formatMoney } from "@/lib/format";
import { setTxPreFilter } from "@/lib/tx-filter-store";

/** Where a split line's transactions live, for the drill-down icon. */
export type SplitDrill = {
  /** Categories rolled into this tile. */
  categoryIds: string[];
  /** Shown as the filter chip label on Transactions. */
  label: string;
  dateFrom?: string;
  dateTo?: string;
};

/**
 * ADR-089: budget figures exclude two-sided (internal) transfers, so the
 * drill-down list must exclude them too — otherwise the total and the rows
 * disagree.
 */

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
  deductedBudgeted,
  deductedSpent,
  deductedPending,
  extra,
  drill,
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
  /**
   * ADR-032/068: payroll- or HSA-funded obligations. Excluded from budgeting
   * math everywhere else, but still surfaced here so the due/paid/pending
   * numbers are visible.
   */
  deductedBudgeted?: number;
  deductedSpent?: number;
  deductedPending?: number;
  extra?: { label: string; value: number };
  /** When set, each line gets an icon that opens the matching Transactions view. */
  drill?: SplitDrill;
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
      linked: "unlinked" as const,
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
      linked: "linked" as const,
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
            linked: "linked" as const,
          },
        ]
      : []),
    ...((deductedBudgeted ?? 0) > 0 ||
    (deductedSpent ?? 0) > 0 ||
    (deductedPending ?? 0) > 0
      ? [
          {
            icon: "💊",
            label: "Deducted (payroll / HSA)",
            spent: deductedSpent ?? 0,
            total: Math.max(deductedBudgeted ?? 0, deductedSpent ?? 0),
            pending: deductedPending,
            spentWord: "paid",
            totalWord: "due",
            remainingWord: "remaining",
            linked: "linked" as const,
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
        <SplitRow key={r.label} {...r} drill={drill} />
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
  linked,
  drill,
}: {
  icon: string;
  label: string;
  spent: number;
  total: number;
  pending?: number;
  spentWord: string;
  totalWord: string;
  remainingWord: string;
  linked: "linked" | "unlinked";
  drill?: SplitDrill;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const over = spent > total;
  const pct = total > 0 ? (spent / total) * 100 : spent > 0 ? 100 : 0;
  const pendingPct = total > 0 && pending ? (pending / total) * 100 : 0;
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
        <span className="flex items-center gap-1">
          <span>
            {icon} {label}
          </span>
          {drill ? (
            <button
              type="button"
              aria-label={`View ${label.toLowerCase()} transactions`}
              className="-m-1 rounded p-1 text-muted-foreground active:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setTxPreFilter({
                  categoryIds: drill.categoryIds,
                  linked,
                  dateFrom: drill.dateFrom,
                  dateTo: drill.dateTo,
                  excludeInternalTransfers: true,
                  label: `${drill.label} · ${label}`,
                });
                void navigate({ to: "/app/transactions" });
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Receipt className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
        <span className={over ? "font-bold text-destructive" : "font-bold text-foreground"}>
          {formatMoney(spent)} / {formatMoney(total)}
        </span>
      </div>
      <ItemBar
        className="mt-1"
        value={pct}
        pendingValue={pendingPct}
        color={budgetRingColor(spent, total)}
      />
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
