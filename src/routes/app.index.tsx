import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  monthKey,
  useAccounts,
  useAllAccountBalances,
  useBills,
  useCategories,
  useDebts,
  useLatestBalances,
  useSpendingActuals,
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
import { billsBudgetedByCategory, buildActualResolver } from "@/lib/spending-actuals";
import { todayISO } from "@/lib/snapshot";
import { billRemainingOwed, debtRemainingOwed, toPayable } from "@/lib/payments";
import { computeArrears } from "@/lib/arrears";

import { useIncomeEvents, useIncomeSources } from "@/lib/income-hooks";
import { eventDate, obligationsInRange, periodRange } from "@/lib/paycheck-budget";
import { categoryVisual } from "@/lib/visual-meta";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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
  const { data: actuals = [] } = useSpendingActuals();
  const { data: categories = [] } = useCategories();
  const { data: balanceHistory = [] } = useAllAccountBalances();
  const { data: sources = [] } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();


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

  /** Budget vs actual for the current month, grouped by parent_category. */
  const budgetChart = useMemo(() => {
    const month = monthKey(new Date());
    const resolver = buildActualResolver(actuals, transactions, bills);
    const billsBudget = billsBudgetedByCategory(bills);
    const byId: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) byId[c.id] = c;
    const groups = new Map<
      string,
      {
        name: string;
        budgeted: number;
        spendingBudgeted: number;
        billsBudgeted: number;
        actual: number;
        spendingSpent: number;
        billsSpent: number;
      }
    >();
    for (const b of budgets) {
      if (!b.category_id) continue;
      const parent = byId[b.category_id]?.parent_category?.trim() || "";
      const key = parent || "__none__";
      const g = groups.get(key) ?? {
        name: parent || "Ungrouped",
        budgeted: 0,
        spendingBudgeted: 0,
        billsBudgeted: 0,
        actual: 0,
        spendingSpent: 0,
        billsSpent: 0,
      };
      const spendingBudget = Number(b.budgeted_amount || 0);
      const billBudget = billsBudget.get(b.category_id) ?? 0;
      const current = resolver.resolve(b.category_id, month);
      g.spendingBudgeted += spendingBudget;
      g.billsBudgeted += billBudget;
      g.budgeted += spendingBudget + billBudget;
      g.actual += current.amount;
      g.spendingSpent += current.spendingSpent;
      g.billsSpent += current.billsSpent;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, actuals, transactions, categories, bills]);



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
      };
    }),
  ]
    .filter((o) => o.amount > 0.005)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTotal = overdue.reduce((sum, o) => sum + o.amount, 0);




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
      <AppHeader title="Dashboard" />
      <div className="space-y-4 p-4">
        <div
          className="overflow-hidden rounded-[16px] text-brand-foreground shadow-[var(--shadow-card)]"
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
              Combined spendable
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">
              {formatMoney(spendable.total)}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm opacity-90">
              <span>
                {formatMoney(periodTotals.total)} set aside this {period.label} ·{" "}
                {formatMoney(payoffTotals.remaining)} debt to go
              </span>
              <HelpButton>
                Bills and minimum debt payments due before your next paycheck — not money
                already moved into savings.
              </HelpButton>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-brand-foreground/15 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
                  Bills this {period.label}
                </p>
                <p className="text-xl font-bold tabular-nums">
                  {formatMoney(periodTotals.bills)}
                </p>
              </div>
              <div className="rounded-[12px] bg-brand-foreground/15 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
                  Debts this {period.label}
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
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Budget vs actual · this month
              </p>
              <BudgetTotals rows={budgetChart} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {budgetChart.map((g, i) => (
                  <BudgetTile key={g.name} group={g} index={i} />
                ))}
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Tap a category for the spending / bills split
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



        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Past due</h2>
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
            <div className="space-y-2">
              {overdue.map((o) => (
                <Card key={o.id}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <EmojiIcon name={o.name} fallback={o.kind === "Debt" ? "🏦" : "🧾"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{o.name}</p>
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
              ))}

            </div>
          )}
        </div>

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
  actual: number;
  spendingSpent: number;
  billsSpent: number;
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
            spendingSpent={g.spendingSpent}
            billsSpent={g.billsSpent}
          />
        </div>
      ) : null}
    </button>
  );
}
