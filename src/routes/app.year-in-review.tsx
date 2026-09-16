import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpButton } from "@/components/HelpButton";
import {
  useAccounts,
  useAllAccountBalances,
  useBills,
  useCategories,
  useDebtAdjustments,
  useDebts,
  useTransactions,
} from "@/lib/data-hooks";
import { useCurrentMember } from "@/lib/household";
import { actualByCategoryInRange, monthlyIncomeVsExpenses } from "@/lib/paycheck-budget";
import { debtBalanceAsOf, debtPayoffTrend, totalPaidDownInYear } from "@/lib/debt-history";
import { netWorthTrend } from "@/lib/net-worth";
import { accountInMemberView } from "@/lib/balances";
import { formatMoney } from "@/lib/format";
import { categoryVisual } from "@/lib/visual-meta";

export const Route = createFileRoute("/app/year-in-review")({
  head: () => ({
    meta: [
      { title: "Year in Review — Hearthstone" },
      {
        name: "description",
        content:
          "Category spending, income vs. expenses, net worth growth, and debt payoff progress for a calendar year.",
      },
      { property: "og:title", content: "Year in Review — Hearthstone" },
      {
        property: "og:description",
        content:
          "Category spending, income vs. expenses, net worth growth, and debt payoff progress for a calendar year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: YearInReviewPage,
});

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
};

/** Bar/line count above which the category-spending chart folds the tail into "Other". */
const CHART_CATEGORY_CAP = 8;

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

function YearInReviewPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: adjustments = [] } = useDebtAdjustments();
  const { data: accounts = [] } = useAccounts();
  const { data: balanceHistory = [] } = useAllAccountBalances();
  // ADR-088: match the home dashboard's own net-worth scoping — the other
  // member's personal accounts are left out of this viewer's trend.
  const currentMember = useCurrentMember();
  const memberId = currentMember?.id;

  const today = new Date();
  const currentYear = today.getFullYear();

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const t of transactions) {
      const y = Number(t.transaction_date?.slice(0, 4));
      if (y) years.add(y);
    }
    return [...years].sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const [year, setYear] = useState(currentYear);
  const isCurrentYear = year === currentYear;
  const rangeStart = `${year}-01-01`;
  const rangeEnd = isCurrentYear ? todayISO() : `${year}-12-31`;

  // --- 1. Category spending breakdown ---
  const categorySpending = useMemo(() => {
    // Debt payments count as category spending here too — same convention
    // as the home dashboard's own budget chart (app.index.tsx). This isn't
    // double-counting against the Debt Payoff card below: that card tracks
    // balance reduction over time, a different dimension of the same dollar.
    const byCategory = actualByCategoryInRange(
      transactions,
      bills,
      debts,
      categories,
      rangeStart,
      `${rangeEnd}T23:59:59`,
    );
    const byId = new Map(categories.map((c) => [c.id, c]));
    const rows = [...byCategory.entries()]
      .map(([categoryId, v]) => {
        const cat = byId.get(categoryId);
        const visual = categoryVisual(cat);
        return { categoryId, name: cat?.name ?? "Uncategorized", icon: visual.icon, total: v.total };
      })
      .filter((r) => r.total > 0.005)
      .sort((a, b) => b.total - a.total);

    const chartRows =
      rows.length <= CHART_CATEGORY_CAP
        ? rows
        : [
            ...rows.slice(0, CHART_CATEGORY_CAP - 1),
            {
              categoryId: "__other__",
              name: "Other",
              icon: "…",
              total: rows.slice(CHART_CATEGORY_CAP - 1).reduce((s, r) => s + r.total, 0),
            },
          ];
    return { rows, chartRows: chartRows.slice().reverse() /* recharts vertical bar renders bottom-up */ };
  }, [transactions, bills, categories, rangeStart, rangeEnd]);

  // --- 2. Income vs. expenses trend ---
  const incomeExpense = useMemo(
    () => monthlyIncomeVsExpenses(transactions, categories, rangeStart, `${rangeEnd}T23:59:59`),
    [transactions, categories, rangeStart, rangeEnd],
  );

  // --- 3. Net worth growth ---
  const netWorth = useMemo(() => {
    const scoped = accounts.filter((a) => accountInMemberView(a, memberId));
    // Current year: trailing months ending today (Jan..now). Past year:
    // a full 12-month Dec-31 series, never projecting into the future.
    const months = isCurrentYear ? today.getMonth() + 1 : 12;
    const asOf = isCurrentYear ? today : new Date(year, 11, 31);
    return netWorthTrend(scoped, balanceHistory, transactions, months, asOf);
  }, [accounts, balanceHistory, transactions, memberId, year, isCurrentYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- 4. Debt payoff progress ---
  const debtTrend = useMemo(
    () =>
      debtPayoffTrend(
        debts,
        adjustments,
        transactions,
        year,
        isCurrentYear ? today : new Date(year, 11, 31),
        accounts,
        balanceHistory,
      ),
    [debts, adjustments, transactions, year, isCurrentYear, accounts, balanceHistory], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const paidDown = useMemo(
    () =>
      totalPaidDownInYear(
        debts,
        adjustments,
        transactions,
        year,
        isCurrentYear ? today : new Date(year, 11, 31),
        accounts,
        balanceHistory,
      ),
    [debts, adjustments, transactions, year, isCurrentYear, accounts, balanceHistory], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const debtProgressRows = useMemo(() => {
    const priorYearEnd = `${year - 1}-12-31`;
    const yearEnd = isCurrentYear ? todayISO() : `${year}-12-31`;
    return debts
      .map((d) => ({
        id: d.id,
        name: d.name,
        paidDown: Math.max(
          0,
          debtBalanceAsOf(d, adjustments, transactions, priorYearEnd, accounts, balanceHistory) -
            debtBalanceAsOf(d, adjustments, transactions, yearEnd, accounts, balanceHistory),
        ),
      }))
      .filter((r) => r.paidDown > 0.005)
      .sort((a, b) => b.paidDown - a.paidDown)
      .slice(0, 8);
  }, [debts, adjustments, transactions, year, isCurrentYear, accounts, balanceHistory]);

  return (
    <>
      <AppHeader title="Year in Review" />
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-24">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 1. Category spending */}
        <Card>
          <CardContent className="p-4">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Category spending
              <HelpButton>
                Every bill, debt, and plain-spending dollar out this year, by
                category. The top {CHART_CATEGORY_CAP - 1} categories are
                charted individually; the rest fold into "Other" — the full
                breakdown is in the table below.
              </HelpButton>
            </p>
            {categorySpending.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No spending recorded for {year} yet.</p>
            ) : (
              <>
                <div className="mt-3" style={{ height: Math.max(160, categorySpending.chartRows.length * 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categorySpending.chartRows}
                      layout="vertical"
                      margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={104}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <Tooltip
                        formatter={(v: number) => formatMoney(v)}
                        contentStyle={TOOLTIP_STYLE}
                        cursor={{ fill: "var(--muted)" }}
                      />
                      <Bar dataKey="total" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 divide-y divide-border/50 text-sm">
                  {categorySpending.rows.map((r) => (
                    <div key={r.categoryId} className="flex items-center justify-between py-1.5">
                      <span className="truncate">
                        <span aria-hidden className="mr-1.5">
                          {r.icon}
                        </span>
                        {r.name}
                      </span>
                      <span className="tabular-nums font-medium">{formatMoney(r.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 2. Income vs. expenses */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Income vs. expenses
            </p>
            {incomeExpense.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity recorded for {year} yet.</p>
            ) : (
              <>
                <div className="mt-3 h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={incomeExpense} margin={{ left: 4, right: 8, top: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis
                        width={48}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
                      />
                      <Tooltip formatter={(v: number, n: string) => [formatMoney(v), n]} contentStyle={TOOLTIP_STYLE} />
                      <Area
                        type="monotone"
                        dataKey="income"
                        name="Income"
                        stroke="var(--chart-2)"
                        fill="var(--chart-2)"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Expenses"
                        stroke="var(--chart-1)"
                        fill="var(--chart-1)"
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                    Income
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                    Expenses
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. Net worth growth */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Net worth growth
            </p>
            {netWorth.length < 2 ? (
              <p className="mt-2 text-sm text-muted-foreground">Not enough history yet for {year}.</p>
            ) : (
              <>
                <p className="mt-1 text-3xl font-extrabold tabular-nums">
                  {formatMoney(netWorth[netWorth.length - 1]?.total ?? 0)}
                </p>
                <div className="mt-3 h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={netWorth} margin={{ left: 4, right: 8, top: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis
                        width={48}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
                      />
                      <Tooltip formatter={(v: number) => [formatMoney(v), "Net worth"]} contentStyle={TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 4. Debt payoff progress */}
        <Card>
          <CardContent className="p-4">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Debt payoff progress
              <HelpButton>
                Total owed across every debt, reconstructed from advances,
                fees, and payments — not a projection. "Paid down this year"
                nets each debt's own change; a debt that grew (a new advance
                drawn, say) never offsets one that shrank.
              </HelpButton>
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">{formatMoney(paidDown)}</p>
            <p className="text-xs text-muted-foreground">paid down in {year}</p>
            {debtTrend.length > 1 && (
              <div className="mt-3 h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={debtTrend} margin={{ left: 4, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis
                      width={48}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
                    />
                    <Tooltip formatter={(v: number) => [formatMoney(v), "Total owed"]} contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {debtProgressRows.length > 0 && (
              <div className="mt-3 divide-y divide-border/50 text-sm">
                {debtProgressRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5">
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums font-medium">{formatMoney(r.paidDown)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
