import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import {
  monthKey,
  categoryDomain,
  useAccounts,
  useAllAccountBalances,
  useBills,
  useCategories,
  useDebts,
  useLatestBalances,
  useSpendingBudgets,
  useTransactions,
} from "@/lib/data-hooks";
import { formatMoney, isDateOverdue, debtDueDate } from "@/lib/format";
import {
  accountTypeIs,
  computeBalances,
  creditAccountsMissingLimit,
  creditOwed,
  spendableContribution,
} from "@/lib/balances";
import { billsBudgetedByCategory } from "@/lib/spending-actuals";
import {
  combinedActualByCategory,
  debtsBudgetedByCategory,
  trailingAverageByCategory,
} from "@/lib/monthly-summary";
import { todayISO } from "@/lib/snapshot";
import { billRemainingOwed, debtRemainingOwed, toPayable } from "@/lib/payments";
import { computeArrears } from "@/lib/arrears";
import { useHouseholdDeductions } from "@/lib/income-hooks";

import { useIncomeEvents, useIncomeSources } from "@/lib/income-hooks";
import {
  actualByCategoryInRange,
  eventDate,
  obligationsInRange,
  periodRange,
} from "@/lib/paycheck-budget";
import { categoryVisual } from "@/lib/visual-meta";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { EmojiIcon, ItemBar, ProgressRing, emojiFor, itemColor } from "@/components/viz";
import { BudgetSplitLines } from "@/components/BudgetSplitLines";
import { HelpButton } from "@/components/HelpButton";


import { netWorthTrend } from "@/lib/net-worth";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];


export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Hearthstone" },
      {
        name: "description",
        content:
          "Household budget dashboard with monthly obligations, income comparison, and overdue items in Hearthstone.",
      },
      { property: "og:title", content: "Dashboard — Hearthstone" },
      {
        property: "og:description",
        content:
          "Household budget dashboard with monthly obligations, income comparison, and overdue items in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: budgets = [] } = useSpendingBudgets();
  const { data: categories = [] } = useCategories();
  const { data: balanceHistory = [] } = useAllAccountBalances();
  const { data: sources = [] } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();
  const { data: householdDeductions = [] } = useHouseholdDeductions();


  const balances = useMemo(
    () => computeBalances(accounts, latest, transactions),
    [accounts, latest, transactions],
  );

  /**
   * Spendable = only is_spendable checking/credit accounts. Savings,
   * investment and retirement are always excluded. ADR-023: credit accounts
   * contribute available credit, and are skipped when credit_limit is unset.
   */
  const spendable = useMemo(() => {
    let total = 0;
    let checking = 0;
    let availableCredit = 0;
    let savings = 0;
    for (const a of accounts) {
      const b = balances[a.id]?.spendable ?? 0;
      const contribution = spendableContribution(a, b);
      if (contribution != null) total += contribution;
      if (accountTypeIs(a, "checking")) checking += b;
      if (accountTypeIs(a, "credit"))
        availableCredit += Number(a.credit_limit ?? 0) - creditOwed(b);
      if (accountTypeIs(a, "savings")) savings += b;
    }
    return { total, checking, availableCredit, savings };
  }, [accounts, balances]);

  /** Credit accounts excluded from the total because credit_limit is missing. */
  const missingLimits = useMemo(
    () => creditAccountsMissingLimit(accounts),
    [accounts],
  );


  /** Net worth over the last 6 months, split by account_type. */
  const netWorth = useMemo(
    () => netWorthTrend(accounts, balanceHistory, transactions, 6),
    [accounts, balanceHistory, transactions],
  );
  const netWorthTypes = useMemo(() => {
    const set = new Set<string>();
    for (const p of netWorth) for (const k of Object.keys(p.byType)) set.add(k);
    return [...set].sort();
  }, [netWorth]);
  const netWorthData = useMemo(
    () =>
      netWorth.map((p) => ({
        label: p.label,
        total: Math.round(p.total),
        ...Object.fromEntries(
          netWorthTypes.map((t) => [t, Math.round(p.byType[t] ?? 0)]),
        ),
      })),
    [netWorth, netWorthTypes],
  );

  /** Money out per category for the current month, largest first. */
  const spendingByCategory = useMemo(() => {
    const month = monthKey(new Date());
    const names: Record<string, string> = {};
    for (const c of categories) names[c.id] = c.name;
    const totals = new Map<string, number>();
    for (const t of transactions) {
      if (t.status !== "cleared") continue;
      if (t.transaction_date.slice(0, 7) !== month) continue;
      const amt = Number(t.amount || 0);
      if (amt >= 0) continue;
      const key = t.category_id ?? "__none__";
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(amt));
    }
    const rows = [...totals.entries()].map(([id, amount]) => ({
      id,
      name: names[id] ?? "Uncategorized",
      amount,
    }));
    rows.sort((a, b) => b.amount - a.amount);
    const max = rows[0]?.amount ?? 0;
    return { rows: rows.slice(0, 8), max, total: rows.reduce((s, r) => s + r.amount, 0) };
  }, [transactions, categories]);

  /** Payoff progress per debt: how much of the starting balance is gone. */
  const payoffProgress = useMemo(
    () =>
      debts
        .filter((d) => !d.date_paid_off)
        .map((d) => {
          const start = Number(d.starting_balance ?? 0);
          const remaining = Number(d.remaining_balance ?? 0);
          const paid = Math.max(0, start - remaining);
          const pct = start > 0 ? Math.min(100, (paid / start) * 100) : 0;
          return { id: d.id, name: d.name, start, remaining, paid, pct };
        })
        .filter((d) => d.start > 0 && d.remaining > 0)
        .sort((a, b) => b.pct - a.pct),
    [debts],
  );

  /**
   * ADR-073: monthly summary, grouped by parent_category like `budgetChart`,
   * but combining bills + debts + spending and comparing against both the
   * manual budget target and a trailing 6-month actual average. Unlike
   * `budgetChart` (which only ever shows categories with a `spending_budgets`
   * row), this includes any category with a bill, debt, budget row, actual
   * spend, or trailing average — so a debt-only category still shows up.
   */
  const monthlySummary = useMemo(() => {
    const month = monthKey(new Date());
    const debtsBudget = debtsBudgetedByCategory(debts, categories);
    const billsBudget = billsBudgetedByCategory(bills, categories);
    const spendingBudget = new Map(
      budgets
        .filter((b) => b.category_id)
        .map((b) => [b.category_id as string, Number(b.budgeted_amount || 0)]),
    );
    const actualByCategory = combinedActualByCategory(transactions, bills, debts, categories, month);
    const trailingByCategory = trailingAverageByCategory(transactions, bills, debts, categories, month, 6);
    const byId: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) byId[c.id] = c;

    const ids = new Set<string>([
      ...spendingBudget.keys(),
      ...billsBudget.keys(),
      ...debtsBudget.keys(),
      ...actualByCategory.keys(),
      ...trailingByCategory.keys(),
    ]);

    const groups = new Map<
      string,
      {
        name: string;
        budgetTarget: number;
        trailingAverage: number;
        actual: number;
        spendingBudgeted: number;
        billsBudgeted: number;
        debtsBudgeted: number;
        spendingSpent: number;
        billsSpent: number;
        debtsSpent: number;
      }
    >();
    for (const id of ids) {
      const cat = byId[id];
      // ADR-069: only spending-domain categories belong here.
      if (!cat || categoryDomain(cat) !== "spending") continue;
      const parent = cat.parent_category?.trim() || "";
      const key = parent || "__none__";
      const g = groups.get(key) ?? {
        name: parent || "Ungrouped",
        budgetTarget: 0,
        trailingAverage: 0,
        actual: 0,
        spendingBudgeted: 0,
        billsBudgeted: 0,
        debtsBudgeted: 0,
        spendingSpent: 0,
        billsSpent: 0,
        debtsSpent: 0,
      };
      const spending = spendingBudget.get(id) ?? 0;
      const billsB = billsBudget.get(id) ?? 0;
      const debtsB = debtsBudget.get(id) ?? 0;
      g.spendingBudgeted += spending;
      g.billsBudgeted += billsB;
      g.debtsBudgeted += debtsB;
      g.budgetTarget += spending + billsB + debtsB;
      g.trailingAverage += trailingByCategory.get(id) ?? 0;
      const a = actualByCategory.get(id);
      if (a) {
        g.actual += a.total;
        g.spendingSpent += a.spendingSpent;
        g.billsSpent += a.billsSpent;
        g.debtsSpent += a.debtsSpent;
      }
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.actual - a.actual);
  }, [budgets, transactions, categories, bills, debts]);



  /**
   * ADR-034: the active pay period (primary paycheck to next primary paycheck),
   * falling back to the calendar month when no income event covers today.
   */
  const period = useMemo(() => {
    const today = todayISO();
    const primary = sources.find((s) => s.is_primary) ?? null;
    const primaryEvents = events
      .filter((e) => primary && e.income_source_id === primary.id)
      .sort((a, b) => (eventDate(a) ?? "").localeCompare(eventDate(b) ?? ""));
    const current = [...primaryEvents]
      .reverse()
      .find((e) => (eventDate(e) ?? "") <= today);
    const range = current ? periodRange(current, primaryEvents) : null;
    if (range) return { ...range, label: "pay period" as const };
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, end, label: "month" as const };
  }, [sources, events]);

  /** Bills and debts due inside the period (paycheck-deducted debts excluded). */
  const periodObligations = useMemo(
    () => obligationsInRange(bills, debts, period.start, period.end),
    [bills, debts, period],
  );

  const periodTotals = useMemo(() => {
    let billTotal = 0;
    let debtTotal = 0;
    for (const o of periodObligations) {
      if (o.kind === "bill") billTotal += o.amount;
      else debtTotal += o.amount;
    }
    return { bills: billTotal, debts: debtTotal, total: billTotal + debtTotal };
  }, [periodObligations]);

  /**
   * Budget vs actual for the CURRENT PAY PERIOD (rescoped from calendar
   * month 2026-08-19 — the household budgets per paycheck, not per calendar
   * month; `spending_budgets.budgeted_amount` has no month dimension in the
   * schema, so it's used as-is as the per-period target). Bills/debts use
   * the real amounts actually due this period (same source as the hero
   * card's "Bills/Debts this pay period" tiles), NOT Monthly Summary's
   * monthly-equivalent smoothed figure — keeps the two cards' math
   * conceptually distinct: Monthly Summary = smoothed average, this card =
   * this period's real numbers.
   */
  const budgetChart = useMemo(() => {
    const billCategory = new Map(bills.map((b) => [b.id, b.category_id]));
    const debtCategory = new Map(debts.map((d) => [d.id, d.category_id]));
    const periodBillsByCategory = new Map<string, number>();
    const periodDebtsByCategory = new Map<string, number>();
    for (const o of periodObligations) {
      const categoryId = o.kind === "bill" ? billCategory.get(o.id) : debtCategory.get(o.id);
      if (!categoryId) continue;
      const map = o.kind === "bill" ? periodBillsByCategory : periodDebtsByCategory;
      map.set(categoryId, (map.get(categoryId) ?? 0) + o.amount);
    }
    const actualByCategory = actualByCategoryInRange(
      transactions,
      bills,
      debts,
      categories,
      period.start,
      period.end,
    );
    const byId: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) byId[c.id] = c;
    const groups = new Map<string, BudgetGroup>();
    for (const b of budgets) {
      if (!b.category_id) continue;
      const cat = byId[b.category_id];
      // ADR-069: only spending-domain categories belong in the budget grid.
      if (!cat || categoryDomain(cat) !== "spending") continue;
      const parent = cat.parent_category?.trim() || "";
      const key = parent || "__none__";
      const g = groups.get(key) ?? {
        name: parent || "Ungrouped",
        budgeted: 0,
        spendingBudgeted: 0,
        billsBudgeted: 0,
        debtsBudgeted: 0,
        actual: 0,
        spendingSpent: 0,
        billsSpent: 0,
        debtsSpent: 0,
      };
      const spendingBudget = Number(b.budgeted_amount || 0);
      const billBudget = periodBillsByCategory.get(b.category_id) ?? 0;
      const debtBudget = periodDebtsByCategory.get(b.category_id) ?? 0;
      const current = actualByCategory.get(b.category_id);
      g.spendingBudgeted += spendingBudget;
      g.billsBudgeted += billBudget;
      g.debtsBudgeted += debtBudget;
      g.budgeted += spendingBudget + billBudget + debtBudget;
      if (current) {
        g.actual += current.total;
        g.spendingSpent += current.spendingSpent;
        g.billsSpent += current.billsSpent;
        g.debtsSpent += current.debtsSpent;
      }
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, transactions, categories, bills, debts, periodObligations, period]);

  /** ADR-034: what's still owed in the period, grouped by category. */
  const owedByCategory = useMemo(() => {
    const billById = new Map(bills.map((b) => [b.id, b]));
    const debtById = new Map(debts.map((d) => [d.id, d]));
    const catById = new Map(categories.map((c) => [c.id, c]));
    type Item = { id: string; kind: "bill" | "debt"; name: string; dueDate: string; amount: number };
    const groups = new Map<
      string,
      { id: string; name: string; icon: string; color: string; total: number; items: Item[] }
    >();
    let total = 0;
    for (const o of periodObligations) {
      const row = o.kind === "bill" ? billById.get(o.id) : debtById.get(o.id);
      if (!row) continue;
      const amount =
        o.kind === "bill"
          ? billRemainingOwed(row as Parameters<typeof billRemainingOwed>[0])
          : debtRemainingOwed(row as Parameters<typeof debtRemainingOwed>[0]);
      if (amount <= 0) continue;
      const cat = row.category_id ? catById.get(row.category_id) : null;
      const visual = categoryVisual(cat ?? null);
      const key = cat?.id ?? "__none__";
      const g =
        groups.get(key) ??
        {
          id: key,
          name: cat?.name ?? "Uncategorized",
          icon: visual.icon,
          color: visual.color,
          total: 0,
          items: [] as Item[],
        };
      g.total += amount;
      g.items.push({ id: o.id, kind: o.kind, name: o.name, dueDate: o.dueDate, amount });
      groups.set(key, g);
      total += amount;
    }
    return {
      total,
      groups: [...groups.values()].sort((a, b) => b.total - a.total),
    };
  }, [periodObligations, bills, debts, categories]);

  /**
   * ADR-068: a past-due item funded by a paycheck deduction reads differently —
   * the money comes off the paycheck, not out of a spending account.
   */
  const fundingLabel = (fundingDeductionId: string | null | undefined) => {
    if (!fundingDeductionId) return null;
    const d = householdDeductions.find((x) => x.id === fundingDeductionId);
    if (!d?.destination_account_id) return null;
    const acct = accounts.find((a) => a.id === d.destination_account_id);
    const hint = `${acct?.account_type ?? ""} ${acct?.name ?? ""}`.toLowerCase();
    return /hsa|fsa/.test(hint) ? "HSA-funded" : "Deduction-funded";
  };

  // ADR-049: overdue is a money figure — missed cycles plus carried-in arrears —
  // so an item months behind reads as more than one cycle's amount.
  const overdue = [
    ...bills.map((b) => {
      const arrears = computeArrears(toPayable("bill", b));
      return {
        id: `bill-${b.id}`,
        name: b.name,
        amount: arrears.amountOverdue || (isDateOverdue(b.next_due_date, b.payment_status) ? billRemainingOwed(b) : 0),
        cycles: arrears.cyclesMissed,
        due_date: arrears.oldestMissedDate ?? b.next_due_date?.slice(0, 10) ?? "",
        kind: "Bill" as const,
        funding: fundingLabel(b.funding_deduction_id),
      };
    }),
    ...debts.map((d) => {
      const arrears = computeArrears(toPayable("debt", d));
      return {
        id: `debt-${d.id}`,
        name: d.name,
        amount: arrears.amountOverdue || (isDateOverdue(debtDueDate(d), d.payment_status) ? debtRemainingOwed(d) : 0),
        cycles: arrears.cyclesMissed,
        due_date: arrears.oldestMissedDate ?? debtDueDate(d) ?? "",
        kind: "Debt" as const,
        funding: fundingLabel(d.funding_deduction_id),
      };
    }),
  ]
    .filter((o) => o.amount > 0.005)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTotal = overdue.reduce((sum, o) => sum + o.amount, 0);

  /** ADR-032: payroll/HSA-deducted debts read differently from ordinary arrears. */
  const deductionDebtIds = new Set(
    debts.filter((d) => d.is_paycheck_deduction === true).map((d) => d.id),
  );
  const isDeductionOverdue = (id: string) =>
    deductionDebtIds.has(id.replace(/^(debt|bill)-/, ""));
  const overdueDeductions = overdue.filter((o) => isDeductionOverdue(o.id));
  const overdueRest = overdue.filter((o) => !isDeductionOverdue(o.id));
  const overdueDeductionsTotal = overdueDeductions.reduce((sum, o) => sum + o.amount, 0);
  /** Deduction/HSA past-due items are already handled automatically — collapsed by default. */
  const [overdueDeductionsOpen, setOverdueDeductionsOpen] = useState(false);

  /** Payoff progress is collapsed by default to keep the dashboard short. */
  const [payoffOpen, setPayoffOpen] = useState(false);




  /** Hero: total debt remaining vs. how much has already been paid off. */
  const payoffTotals = payoffProgress.reduce(
    (acc, d) => {
      acc.start += d.start;
      acc.remaining += d.remaining;
      acc.paid += d.paid;
      return acc;
    },
    { start: 0, remaining: 0, paid: 0 },
  );
  const paidPct =
    payoffTotals.start > 0
      ? Math.min(100, (payoffTotals.paid / payoffTotals.start) * 100)
      : 0;

  return (
    <>
      <AppHeader
        title="Dashboard"
        action={
          <Link to="/app/paycheck">
            <Button variant="ghost" size="icon" aria-label="Paycheck Budget">
              <CalendarClock className="h-5 w-5" />
            </Button>
          </Link>
        }
      />
      <div className="space-y-4 p-4">
        <div
          className="overflow-hidden rounded-[16px] text-brand-foreground shadow-[var(--shadow-card)]"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          <div className="p-5">
            <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest opacity-80">
              Combined spendable
              <HelpButton>
                Checking and credit-card accounts only. Credit cards add their
                unused limit, not their balance. Savings, investment, and
                retirement accounts are never counted here.
              </HelpButton>
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">
              {formatMoney(spendable.total)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm opacity-90">
              <span className="inline-flex items-center gap-1">
                {formatMoney(periodTotals.total)} due this {period.label}
                <HelpButton>
                  Every bill and minimum debt payment due inside this{" "}
                  {period.label} — the full amount owed on each, not what's
                  already been paid this {period.label} and not money set
                  aside anywhere. "Still owed this {period.label}" below is
                  what's actually left to pay.
                </HelpButton>
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                {formatMoney(payoffTotals.remaining)} debt to go
                <HelpButton>
                  Total remaining balance across every debt that isn't paid
                  off yet.
                </HelpButton>
              </span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-brand-foreground/15 p-3">
                <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest opacity-80">
                  Bills this {period.label}
                  <HelpButton>
                    Every bill due this {period.label}, at its full due-date
                    amount — includes bills already partly or fully paid this
                    {" "}{period.label}.
                  </HelpButton>
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {formatMoney(periodTotals.bills)}
                </p>
              </div>
              <div className="rounded-[12px] bg-brand-foreground/15 p-3">
                <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest opacity-80">
                  Debts this {period.label}
                  <HelpButton>
                    Every debt's minimum payment due this {period.label}, at
                    the full amount — includes debts already partly or fully
                    paid this {period.label}.
                  </HelpButton>
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {formatMoney(periodTotals.debts)}
                </p>
              </div>
            </div>
          </div>
          <div className="h-2 w-full bg-brand-foreground/20">
            <div className="h-full bg-brand-foreground/85" style={{ width: `${paidPct}%` }} />
          </div>
        </div>

        <Link to="/app/paycheck">
          <Card className="active:bg-muted/60">
            <CardContent className="flex items-center gap-3 p-4">
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Paycheck Budget</p>
                <p className="text-xs text-muted-foreground">
                  Plan and allocate this {period.label}'s income
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Spendable breakdown
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Checking</span>
                <span className="font-bold tabular-nums">
                  {formatMoney(spendable.checking)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  Available credit
                  <HelpButton>
                    Unused credit-card limit, counted as spendable since it's money you
                    could use right now.
                  </HelpButton>
                </span>
                <span className="font-bold tabular-nums">
                  {formatMoney(spendable.availableCredit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Savings (not included)</span>
                <span className="font-bold tabular-nums">
                  {formatMoney(spendable.savings)}
                </span>
              </div>
            </div>
            {missingLimits.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-destructive/10 p-2 text-xs">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>
                  Excluded from the total — no credit limit set:{" "}
                  <span className="font-medium">
                    {missingLimits.map((a) => a.name).join(", ")}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {budgetChart.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Budget vs actual · this pay period
                <HelpButton>
                  Your budgeted amount per category, compared against bills,
                  debt minimum payments, and spending actually due/spent in
                  this specific pay period ({period.start} → {period.end}).
                  Different from "Monthly summary" below, which always
                  covers the current calendar month and compares against
                  both a budget target and your own trailing 6-month average
                  — use this card for per-paycheck planning, that one for a
                  monthly-spending sanity check.
                </HelpButton>
              </p>
              <BudgetTotals rows={budgetChart} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {budgetChart.map((g, i) => (
                  <BudgetTile key={g.name} group={g} index={i} />
                ))}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Tap a category for the spending / bills / debts split
              </p>
            </CardContent>
          </Card>
        )}





        {spendingByCategory.rows.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Spending by category · this month
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">
                {formatMoney(spendingByCategory.total)}
              </p>
              <div className="mt-3 space-y-2">
                {spendingByCategory.rows.map((r, i) => (
                  <div key={r.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <span aria-hidden>{emojiFor(r.name)}</span>
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatMoney(r.amount)}
                      </span>
                    </div>
                    <ItemBar
                      className="mt-1"
                      color={itemColor(i)}
                      value={
                        spendingByCategory.max
                          ? (r.amount / spendingByCategory.max) * 100
                          : 0
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Still owed this {period.label}
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {formatMoney(owedByCategory.total)}
            </p>
            {owedByCategory.groups.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing left owed in this period.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {owedByCategory.groups.map((g) => (
                  <div
                    key={g.id}
                    className="rounded-[12px] border-l-4 bg-muted/40 p-3"
                    style={{ borderLeftColor: g.color }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                        <span aria-hidden>{g.icon}</span>
                        <span className="truncate">{g.name}</span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {formatMoney(g.total)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {g.items.map((it) => (
                        <div
                          key={`${it.kind}-${it.id}`}
                          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                        >
                          <span className="truncate">
                            {it.name} · due {it.dueDate}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-foreground">
                            {formatMoney(it.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {payoffProgress.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <button
                type="button"
                onClick={() => setPayoffOpen((v) => !v)}
                aria-expanded={payoffOpen}
                className="flex w-full items-center justify-between gap-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Payoff progress
                </span>
                {payoffOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {payoffOpen ? (
                <div className="mt-3 space-y-3">
                  {payoffProgress.map((d, i) => (
                    <div key={d.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <span aria-hidden>{emojiFor(d.name, "🏦")}</span>
                          <span className="truncate">{d.name}</span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {formatMoney(d.remaining)}
                        </span>
                      </div>
                      <ItemBar className="mt-1" value={d.pct} color={itemColor(i)} />
                      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        {Math.round(d.pct)}% paid off
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}




        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h2 className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide">
              Past due
              <HelpButton>
                'Still owed' is what's due before your next paycheck. 'Past due' is what's
                already missed a due date.
              </HelpButton>
            </h2>
            {overdueTotal > 0 ? (
              <span className="ml-auto text-sm font-bold tabular-nums text-destructive">
                {formatMoney(overdueTotal)}
              </span>
            ) : null}
          </div>
          {overdue.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nothing past due. Nice.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {overdueDeductions.length > 0 ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOverdueDeductionsOpen((v) => !v)}
                    aria-expanded={overdueDeductionsOpen}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Paycheck / HSA deduction · {overdueDeductions.length}
                      {" "}· {formatMoney(overdueDeductionsTotal)}
                    </span>
                    {overdueDeductionsOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {overdueDeductionsOpen
                    ? overdueDeductions.map((o) => <OverdueRow key={o.id} item={o} />)
                    : null}
                </div>
              ) : null}
              {overdueRest.length > 0 ? (
                <div className="space-y-2">
                  {overdueDeductions.length > 0 ? (
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Other
                    </p>
                  ) : null}
                  {overdueRest.map((o) => (
                    <OverdueRow key={o.id} item={o} />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {monthlySummary.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Monthly summary
                <HelpButton>
                  Bills, debt minimum payments, and spending combined, by
                  category, for this calendar month so far — compared against
                  both your budget target and the household's own trailing
                  6-month average. Paycheck/HSA-deducted debts are excluded,
                  same as everywhere else they never touch spendable cash.
                </HelpButton>
              </p>
              <MonthlySummaryTotals groups={monthlySummary} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {monthlySummary.map((g, i) => (
                  <MonthlySummaryTile key={g.name} group={g} index={i} />
                ))}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Tap a category for the spending / bills / debts split
              </p>
            </CardContent>
          </Card>
        )}

        {netWorthData.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Net worth trend
              </p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">
                {formatMoney(netWorth[netWorth.length - 1]?.total ?? 0)}
              </p>

              <div className="mt-3 h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={netWorthData} margin={{ left: 4, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis
                      width={48}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
                    />
                    <Tooltip
                      formatter={(v: number, n: string) => [formatMoney(v), n]}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                    {netWorthTypes.map((t, i) => (
                      <Line
                        key={t}
                        type="monotone"
                        dataKey={t}
                        name={t}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {netWorthTypes.map((t, i) => (
                  <span key={t} className="flex items-center gap-1 capitalize">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    {t}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

type BudgetGroup = {
  name: string;
  budgeted: number;
  spendingBudgeted: number;
  billsBudgeted: number;
  debtsBudgeted: number;
  actual: number;
  spendingSpent: number;
  billsSpent: number;
  debtsSpent: number;
};

/** Single headline bar for the whole month's budget load. */
function BudgetTotals({ rows }: { rows: BudgetGroup[] }) {
  const budgeted = rows.reduce((s, r) => s + r.budgeted, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const pct = budgeted > 0 ? Math.min(100, (actual / budgeted) * 100) : actual > 0 ? 100 : 0;
  const over = budgeted > 0 && actual > budgeted;
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(actual)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          of {formatMoney(budgeted)}
        </p>
      </div>
      <ItemBar
        value={pct}
        color={over ? "var(--destructive)" : "var(--brand)"}
        className="mt-2"
      />
    </div>
  );
}

type OverdueItem = {
  id: string;
  name: string;
  amount: number;
  cycles: number;
  due_date: string;
  kind: "Bill" | "Debt";
  /** ADR-068: set when a paycheck deduction covers this item. */
  funding?: string | null;
};

/** One past-due row (ADR-049: past due is a money figure). */
function OverdueRow({ item: o }: { item: OverdueItem }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <EmojiIcon name={o.name} fallback={o.kind === "Debt" ? "🏦" : "🧾"} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-medium">
            <span className="truncate">{o.name}</span>
            {o.funding ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {o.funding}
              </span>
            ) : null}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {o.kind}
            {o.cycles > 1 ? ` · ${o.cycles} cycles behind` : ""}
            {o.due_date ? ` · since ${o.due_date}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-lg font-extrabold tabular-nums text-destructive">
          {formatMoney(o.amount)}
        </p>
      </CardContent>
    </Card>
  );
}

/** Compact tile per parent category — ring first, numbers on tap. */
function BudgetTile({ group: g, index: i }: { group: BudgetGroup; index: number }) {
  const [open, setOpen] = useState(false);
  const pct = g.budgeted
    ? Math.min(100, (g.actual / g.budgeted) * 100)
    : g.actual > 0
      ? 100
      : 0;
  const over = g.budgeted > 0 && g.actual > g.budgeted;
  const color = over ? "var(--destructive)" : itemColor(i);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="rounded-[14px] bg-muted/40 p-3 text-left active:bg-muted"
      aria-expanded={open}
    >
      <div className="flex items-center gap-2">
        <ProgressRing value={pct} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span aria-hidden>{emojiFor(g.name)}</span>
            <span className="truncate">{g.name}</span>
          </span>
          <span
            className={
              over
                ? "text-xs uppercase tracking-widest text-destructive"
                : "text-xs uppercase tracking-widest text-muted-foreground"
            }
          >
            {over
              ? `${formatMoney(g.actual - g.budgeted)} over`
              : `${formatMoney(g.budgeted - g.actual)} left`}
          </span>
        </div>
      </div>
      {open ? (
        <div className="mt-2">
          <BudgetSplitLines
            spendingBudgeted={g.spendingBudgeted}
            billsBudgeted={g.billsBudgeted}
            debtsBudgeted={g.debtsBudgeted}
            spendingSpent={g.spendingSpent}
            billsSpent={g.billsSpent}
            debtsSpent={g.debtsSpent}
          />
        </div>
      ) : null}
    </button>
  );
}

/** ADR-073: bills + debts + spending combined, vs. budget target and trailing average. */
type MonthlySummaryGroup = {
  name: string;
  budgetTarget: number;
  trailingAverage: number;
  actual: number;
  spendingBudgeted: number;
  billsBudgeted: number;
  debtsBudgeted: number;
  spendingSpent: number;
  billsSpent: number;
  debtsSpent: number;
};

/** Headline bar: actual so far vs. budget target, with the trailing average as a reference line. */
function MonthlySummaryTotals({ groups }: { groups: MonthlySummaryGroup[] }) {
  const actual = groups.reduce((s, g) => s + g.actual, 0);
  const budgetTarget = groups.reduce((s, g) => s + g.budgetTarget, 0);
  const trailingAverage = groups.reduce((s, g) => s + g.trailingAverage, 0);
  const pct =
    budgetTarget > 0 ? Math.min(100, (actual / budgetTarget) * 100) : actual > 0 ? 100 : 0;
  const over = budgetTarget > 0 && actual > budgetTarget;
  const vsAverage = actual - trailingAverage;
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-3xl font-extrabold tabular-nums">{formatMoney(actual)}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          of {formatMoney(budgetTarget)} budget
        </p>
      </div>
      <ItemBar
        value={pct}
        color={over ? "var(--destructive)" : "var(--brand)"}
        className="mt-2"
      />
      {trailingAverage > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          6-mo average {formatMoney(trailingAverage)} ·{" "}
          {vsAverage >= 0
            ? `${formatMoney(vsAverage)} above average so far`
            : `${formatMoney(Math.abs(vsAverage))} below average so far`}
        </p>
      ) : null}
    </div>
  );
}

/** One category tile: ring against budget target, tap to reveal spending/bills/debts split + trailing average. */
function MonthlySummaryTile({ group: g, index: i }: { group: MonthlySummaryGroup; index: number }) {
  const [open, setOpen] = useState(false);
  const pct = g.budgetTarget
    ? Math.min(100, (g.actual / g.budgetTarget) * 100)
    : g.actual > 0
      ? 100
      : 0;
  const over = g.budgetTarget > 0 && g.actual > g.budgetTarget;
  const color = over ? "var(--destructive)" : itemColor(i);
  const vsAverage = g.actual - g.trailingAverage;
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="rounded-[14px] bg-muted/40 p-3 text-left active:bg-muted"
      aria-expanded={open}
    >
      <div className="flex items-center gap-2">
        <ProgressRing value={pct} color={color} size={44} />
        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span aria-hidden>{emojiFor(g.name)}</span>
            <span className="truncate">{g.name}</span>
          </span>
          <span
            className={
              over
                ? "text-xs uppercase tracking-widest text-destructive"
                : "text-xs uppercase tracking-widest text-muted-foreground"
            }
          >
            {formatMoney(g.actual)} of {formatMoney(g.budgetTarget)} expected
          </span>
          {g.trailingAverage > 0 ? (
            <span className="block text-[10px] text-muted-foreground">
              {vsAverage >= 0
                ? `${formatMoney(vsAverage)} above avg`
                : `${formatMoney(Math.abs(vsAverage))} below avg`}
            </span>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="mt-2">
          <BudgetSplitLines
            spendingBudgeted={g.spendingBudgeted}
            billsBudgeted={g.billsBudgeted}
            debtsBudgeted={g.debtsBudgeted}
            spendingSpent={g.spendingSpent}
            billsSpent={g.billsSpent}
            debtsSpent={g.debtsSpent}
            extra={{ label: "6-mo average", value: g.trailingAverage }}
          />
        </div>
      ) : null}
    </button>
  );
}
