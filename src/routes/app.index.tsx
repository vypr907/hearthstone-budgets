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
  useAutoTransfers,
  useBills,
  useCategories,
  useEffectiveDebts,
  useDebtStrategySettings,
  useInstitutions,
  useLatestBalances,
  useSpendingBudgets,
  useTransactions,
} from "@/lib/data-hooks";
import { deriveAutoTransferState, isAutoTransferOverdue } from "@/lib/auto-transfers";
import { baselineComparison, comparisonLabel } from "@/lib/strategy-lock";
import { formatMoney, formatWindow, isDateOverdue, debtDueDate } from "@/lib/format";
import {
  accountInMemberView,
  accountTypeIs,
  computeBalances,
  creditAccountsMissingLimit,
  creditOwed,
  spendableContribution,
} from "@/lib/balances";
import { useCurrentMember } from "@/lib/household";
import { billsBudgetedByCategory } from "@/lib/spending-actuals";
import {
  combinedActualByCategory,
  debtsBudgetedByCategory,
  trailingAverageByCategory,
} from "@/lib/monthly-summary";
import { todayISO } from "@/lib/snapshot";
import { billRemainingOwed, debtRemainingOwed, toPayable } from "@/lib/payments";
import { computeArrears, priorArrearsSummary } from "@/lib/arrears";
import { deductionFundingLabel, pastDueGroup, type PastDueGroup } from "@/lib/deduction-funding";
import { useHouseholdDeductions } from "@/lib/income-hooks";

import { useIncomeEvents, useIncomeSources } from "@/lib/income-hooks";
import {
  actualByCategoryInRange,
  eventAmount,
  eventDate,
  inRange,
  obligationsInRange,
  periodRange,
} from "@/lib/paycheck-budget";
import { deriveCycleInfo } from "@/lib/ledger-state";
import { internalTransferIds } from "@/lib/internal-transfers";
import type { Obligation } from "@/lib/paycheck-budget";
import type { Bill, Debt, Transaction } from "@/lib/supabase";
import { categoryVisual, AUTO_TRANSFER_ICON } from "@/lib/visual-meta";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { EmojiIcon, ItemBar, ProgressRing, budgetRingColor, emojiFor, itemColor } from "@/components/viz";
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

/**
 * Dashboard "Simple" view (ADR-096): a condensed per-category grouping for
 * the Spend section, independent of `categories.parent_category`. Anything
 * not listed here falls to "Misc". Follows existing parent_category on the
 * two cases that would otherwise conflict with it (Software & Tech stays
 * with its Entertainment siblings under Fun; Shopping stays with its Misc
 * siblings) — confirmed with the user rather than assumed.
 */
const SIMPLE_SPEND_GROUP: Record<string, string> = {
  "Dining & Drinks": "Food",
  "Groceries": "Food",
  "Snacks & Drinks": "Food",
  "Entertainment": "Fun",
  "Gaming": "Fun",
  "Hobbies": "Fun",
  "Software & Tech": "Fun",
  "Trip": "Fun",
  "Green": "Green",
  "Kitten": "Kitten",
  "Auto & Transport": "Car",
  "Home & Garden": "Home & Garden",
  "Health & Wellness": "Personal",
  "Medical": "Personal",
  "Personal Care": "Personal",
  "Pets": "Pets",
  "Smoking": "Puff",
  "Vaping": "Puff",
  "Emergency Fund": "Savings",
  "General": "Savings",
  "Gifts/Holidays": "Savings",
  "Taxes": "Savings",
  "Travel": "Savings",
  "Vehicle": "Savings",
};

function simpleSpendGroupFor(categoryName: string | null | undefined): string {
  return SIMPLE_SPEND_GROUP[categoryName ?? ""] ?? "Misc";
}

const DASHBOARD_VIEW_KEY = "dashboard-view";

/**
 * ADR-096: for the Simple view's Bills/Debts cards — of what's due this
 * period, how much is already paid (cleared) vs. pending vs. overdue.
 * "Overdue" is the existing household-wide Past Due figure (ADR-049),
 * filtered to this kind — a different scope than "due this period", so the
 * three sub-figures aren't guaranteed to sum to `total`.
 */
function obligationStatusTotals(
  kind: "bill" | "debt",
  total: number,
  items: (Bill | Debt)[],
  periodObligations: Obligation[],
  transactions: Transaction[],
  overdue: { kind: "Bill" | "Debt"; amount: number }[],
): { total: number; paid: number; pending: number; overdue: number } {
  const today = todayISO();
  const byId = new Map(items.map((it) => [it.id, it]));
  let paid = 0;
  let pending = 0;
  for (const o of periodObligations) {
    if (o.kind !== kind) continue;
    const item = byId.get(o.id);
    if (!item) continue;
    const info = deriveCycleInfo(toPayable(kind, item), transactions, today);
    if (info.state === "cleared") paid += info.due;
    else if (info.state === "partial") paid += info.clearedSum;
    if (info.pending) pending += Math.abs(Number(info.pending.amount ?? 0));
  }
  const overdueKind = kind === "bill" ? "Bill" : "Debt";
  const overdueAmount = overdue
    .filter((o) => o.kind === overdueKind)
    .reduce((s, o) => s + o.amount, 0);
  return { total, paid, pending, overdue: overdueAmount };
}


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
  /** ADR-096: Simple/More Info toggle, remembered per device. */
  const [view, setView] = useState<"simple" | "more">(() => {
    if (typeof window === "undefined") return "simple";
    return window.localStorage.getItem(DASHBOARD_VIEW_KEY) === "more" ? "more" : "simple";
  });
  function setViewPersist(v: "simple" | "more") {
    setView(v);
    window.localStorage.setItem(DASHBOARD_VIEW_KEY, v);
  }

  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useEffectiveDebts();
  const { data: strategySettings } = useDebtStrategySettings();
  const { data: autoTransfers = [] } = useAutoTransfers();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: budgets = [] } = useSpendingBudgets();
  const { data: categories = [] } = useCategories();
  const { data: balanceHistory = [] } = useAllAccountBalances();
  const { data: sources = [] } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();
  const { data: householdDeductions = [] } = useHouseholdDeductions();
  // ADR-088: the signed-in member — personal accounts owned by the other member
  // are left out of this viewer's spendable + net-worth totals.
  const currentMember = useCurrentMember();
  const memberId = currentMember?.id;


  const balances = useMemo(
    () => computeBalances(accounts, latest, transactions),
    [accounts, latest, transactions],
  );

  /**
   * Spendable = only is_spendable checking/credit accounts. Savings,
   * investment and retirement are always excluded. ADR-023: credit accounts
   * contribute available credit, and are skipped when credit_limit is unset.
   * ADR-088: accounts owned by the other member are skipped entirely.
   */
  const spendable = useMemo(() => {
    let total = 0;
    let checking = 0;
    let availableCredit = 0;
    let savings = 0;
    for (const a of accounts) {
      if (!accountInMemberView(a, memberId)) continue;
      const b = balances[a.id]?.spendable ?? 0;
      const contribution = spendableContribution(a, b);
      if (contribution != null) total += contribution;
      if (accountTypeIs(a, "checking")) checking += b;
      if (accountTypeIs(a, "credit"))
        availableCredit += Number(a.credit_limit ?? 0) - creditOwed(b);
      if (accountTypeIs(a, "savings")) savings += b;
    }
    return { total, checking, availableCredit, savings };
  }, [accounts, balances, memberId]);

  /** Credit accounts excluded from the total because credit_limit is missing. */
  const missingLimits = useMemo(
    () =>
      creditAccountsMissingLimit(
        accounts.filter((a) => accountInMemberView(a, memberId)),
      ),
    [accounts, memberId],
  );


  /**
   * Net worth over the last 6 months, split by account_type. ADR-088: the
   * other member's personal accounts are dropped here; netWorthTrend itself
   * also skips accounts flagged include_in_net_worth === false.
   */
  const netWorth = useMemo(
    () =>
      netWorthTrend(
        accounts.filter((a) => accountInMemberView(a, memberId)),
        balanceHistory,
        transactions,
        6,
      ),
    [accounts, balanceHistory, transactions, memberId],
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
        categoryIds: string[];
        month: string;
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
        categoryIds: [],
        month,
      };
      g.categoryIds.push(id);
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

  /** Bills, debts and auto-transfers due inside the period (paycheck-deducted debts excluded). */
  const periodObligations = useMemo(
    () => obligationsInRange(bills, debts, autoTransfers, period.start, period.end),
    [bills, debts, autoTransfers, period],
  );

  const periodTotals = useMemo(() => {
    let billTotal = 0;
    let debtTotal = 0;
    let autoTransferTotal = 0;
    for (const o of periodObligations) {
      if (o.kind === "bill") billTotal += o.amount;
      else if (o.kind === "debt") debtTotal += o.amount;
      else autoTransferTotal += o.amount;
    }
    return {
      bills: billTotal,
      debts: debtTotal,
      autoTransfers: autoTransferTotal,
      total: billTotal + debtTotal + autoTransferTotal,
    };
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
    // ADR-032/068: payroll- and HSA-funded debts sit outside budgeting math,
    // but the household still wants to see what's due / paid / pending on
    // them. Tracked as a separate line that never feeds `budgeted`/`actual`.
    const deductedDebts = debts.filter((d) => d.is_paycheck_deduction === true);
    const deductedIds = new Set(deductedDebts.map((d) => d.id));
    const deductedDueByCategory = new Map<string, number>();
    for (const o of obligationsInRange(
      [],
      deductedDebts.map((d) => ({ ...d, is_paycheck_deduction: false })),
      [],
      period.start,
      period.end,
    )) {
      const categoryId = debtCategory.get(o.id);
      if (!categoryId) continue;
      deductedDueByCategory.set(
        categoryId,
        (deductedDueByCategory.get(categoryId) ?? 0) + o.amount,
      );
    }
    const deductedPaidByCategory = new Map<string, number>();
    const deductedPendingByCategory = new Map<string, number>();
    for (const t of transactions) {
      const debtId = t.linked_debt_id ?? null;
      if (!debtId || !deductedIds.has(debtId)) continue;
      const date = (t.transaction_date ?? "").slice(0, 10);
      if (!(date >= period.start && date < period.end)) continue;
      const amount = Number(t.amount || 0);
      if (amount >= 0) continue;
      const categoryId =
        (t as { category_id?: string | null }).category_id ?? debtCategory.get(debtId) ?? null;
      if (!categoryId) continue;
      const map =
        (t.status ?? "cleared") === "pending"
          ? deductedPendingByCategory
          : deductedPaidByCategory;
      map.set(categoryId, (map.get(categoryId) ?? 0) + Math.abs(amount));
    }
    // Spent = cleared money only; pending is reported as its own figure so
    // the split-line detail can show both without double-counting.
    const actualByCategory = actualByCategoryInRange(
      transactions.filter((t) => (t.status ?? "cleared") !== "pending"),
      bills,
      debts,
      categories,
      period.start,
      period.end,
    );
    const pendingByCategory = actualByCategoryInRange(
      transactions.filter((t) => (t.status ?? "cleared") === "pending"),
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
        spendingPending: 0,
        billsPending: 0,
        debtsPending: 0,
        deductedBudgeted: 0,
        deductedSpent: 0,
        deductedPending: 0,
        categoryIds: [],
        periodStart: period.start,
        periodEnd: period.end,
      };
      g.categoryIds.push(b.category_id);
      const spendingBudget = Number(b.budgeted_amount || 0);
      const current = actualByCategory.get(b.category_id);
      const pending = pendingByCategory.get(b.category_id);
      // A bill/debt already paid this period drops off the "due" scan, so its
      // expected amount would read $0 against real spend. Floor the expected
      // figure at what was actually paid — mirrors BudgetSplitLines.
      const billBudget = Math.max(
        periodBillsByCategory.get(b.category_id) ?? 0,
        current?.billsSpent ?? 0,
      );
      const debtBudget = Math.max(
        periodDebtsByCategory.get(b.category_id) ?? 0,
        current?.debtsSpent ?? 0,
      );
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
      if (pending) {
        g.spendingPending += pending.spendingSpent;
        g.billsPending += pending.billsSpent;
        g.debtsPending += pending.debtsSpent;
      }
      // Informational only — deliberately not added to budgeted/actual.
      const deductedPaid = deductedPaidByCategory.get(b.category_id) ?? 0;
      g.deductedSpent += deductedPaid;
      g.deductedPending += deductedPendingByCategory.get(b.category_id) ?? 0;
      g.deductedBudgeted += Math.max(
        deductedDueByCategory.get(b.category_id) ?? 0,
        deductedPaid,
      );
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
      // Safe: auto_transfer rows never reach here — `row` only resolves for
      // bill/debt ids above, so a miss (undefined row) already `continue`d.
      g.items.push({
        id: o.id,
        kind: o.kind as "bill" | "debt",
        name: o.name,
        dueDate: o.dueDate,
        amount,
      });
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
  // ADR-049 addendum: `priorArrearsSummary` counts only cycles from before this
  // calendar month — the current cycle shows separately under "Still owed this
  // period" (ADR-080), so counting it here too would double it on the Dashboard.
  // The isDateOverdue fallback is kept only for the case where the arrears walk
  // produced nothing (e.g. no next_due_date) — gated on `cyclesMissed === 0` so
  // it never re-adds a current cycle that priorArrearsSummary deliberately left out.
  // ADR-082: `group` is the Past Due bucket — paycheck_deduction / hsa_fsa
  // (auto-settled off a paycheck) or other (an ordinary bill/debt to pay).
  const overdue = [
    ...bills.map((b) => {
      const prior = priorArrearsSummary(toPayable("bill", b));
      const noWalk = computeArrears(toPayable("bill", b)).cyclesMissed === 0;
      return {
        id: `bill-${b.id}`,
        name: b.name,
        amount:
          prior.amount ||
          (noWalk && isDateOverdue(b.next_due_date, b.payment_status) ? billRemainingOwed(b) : 0),
        cycles: prior.cycles,
        due_date: prior.oldestMissedDate ?? b.next_due_date?.slice(0, 10) ?? "",
        kind: "Bill" as const,
        funding: deductionFundingLabel(b.funding_deduction_id, householdDeductions),
        group: pastDueGroup(b, householdDeductions),
      };
    }),
    ...debts.map((d) => {
      const prior = priorArrearsSummary(toPayable("debt", d));
      // A paid-off debt (remaining_balance <= 0) must never fall through to
      // the isDateOverdue fallback below — that check only looks at
      // payment_status, which can be stale ("unpaid") on a debt that's
      // actually been paid off, making it wrongly reappear as past due.
      const paidOff = Number(d.remaining_balance ?? 0) <= 0;
      const noWalk = computeArrears(toPayable("debt", d)).cyclesMissed === 0;
      return {
        id: `debt-${d.id}`,
        name: d.name,
        amount:
          prior.amount ||
          (noWalk && !paidOff && isDateOverdue(debtDueDate(d), d.payment_status)
            ? debtRemainingOwed(d)
            : 0),
        cycles: prior.cycles,
        due_date: prior.oldestMissedDate ?? debtDueDate(d) ?? "",
        kind: "Debt" as const,
        funding: deductionFundingLabel(d.funding_deduction_id, householdDeductions),
        group: pastDueGroup(d, householdDeductions),
      };
    }),
  ]
    .filter((o) => o.amount > 0.005)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const overdueTotal = overdue.reduce((sum, o) => sum + o.amount, 0);

  /* ---------------- ADR-096: Simple view data ---------------- */

  /** Every income event landing inside the current pay period, across all sources. */
  const incomeThisPeriod = useMemo(
    () =>
      events
        .filter((e) => inRange(eventDate(e), period.start, period.end))
        .reduce((s, e) => s + eventAmount(e), 0),
    [events, period],
  );

  /**
   * Bills/Debts due this period, broken into paid so far / pending / overdue.
   * "Overdue" reuses the existing Past Due figure above (ADR-049) — a
   * different scope (missed cycles before this period) than "due this
   * period", so these four numbers won't necessarily add up to the total;
   * that's consistent with how the rest of the Dashboard already treats them.
   */
  const billsStatus = useMemo(
    () => obligationStatusTotals("bill", periodTotals.bills, bills, periodObligations, transactions, overdue),
    [periodTotals.bills, bills, periodObligations, transactions, overdue],
  );
  const debtsStatus = useMemo(
    () => obligationStatusTotals("debt", periodTotals.debts, debts, periodObligations, transactions, overdue),
    [periodTotals.debts, debts, periodObligations, transactions, overdue],
  );

  /**
   * Spend section: mirrors `budgetChart` below but spending-only, grouped by
   * `SIMPLE_SPEND_GROUP` instead of `parent_category`.
   */
  const simpleSpendGroups = useMemo(() => {
    const actualByCategory = actualByCategoryInRange(
      transactions.filter((t) => (t.status ?? "cleared") !== "pending"),
      bills,
      debts,
      categories,
      period.start,
      period.end,
    );
    const pendingByCategory = actualByCategoryInRange(
      transactions.filter((t) => (t.status ?? "cleared") === "pending"),
      bills,
      debts,
      categories,
      period.start,
      period.end,
    );
    const byId = new Map(categories.map((c) => [c.id, c]));
    const groups = new Map<string, BudgetGroup>();
    for (const b of budgets) {
      if (!b.category_id) continue;
      const cat = byId.get(b.category_id);
      if (!cat || categoryDomain(cat) !== "spending") continue;
      const name = simpleSpendGroupFor(cat.name);
      const g = groups.get(name) ?? {
        name,
        budgeted: 0,
        spendingBudgeted: 0,
        billsBudgeted: 0,
        debtsBudgeted: 0,
        actual: 0,
        spendingSpent: 0,
        billsSpent: 0,
        debtsSpent: 0,
        spendingPending: 0,
        billsPending: 0,
        debtsPending: 0,
        deductedBudgeted: 0,
        deductedSpent: 0,
        deductedPending: 0,
        categoryIds: [] as string[],
        periodStart: period.start,
        periodEnd: period.end,
      };
      g.categoryIds.push(b.category_id);
      const budgeted = Number(b.budgeted_amount || 0);
      const spent = actualByCategory.get(b.category_id)?.spendingSpent ?? 0;
      const pending = pendingByCategory.get(b.category_id)?.spendingSpent ?? 0;
      g.spendingBudgeted += budgeted;
      g.budgeted += budgeted;
      g.spendingSpent += spent;
      g.actual += spent;
      g.spendingPending += pending;
      groups.set(name, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, transactions, categories, bills, debts, period]);

  /**
   * ADR-081: auto-transfers not yet processed this cycle, deliberately kept
   * off the "Past due" list above — there's no vendor and nothing is
   * actually owed, so overdue ones get a soft "check on this" flag instead
   * of red arrears money. Anything already processed this cycle drops off
   * the list; there's nothing left to remind about.
   */
  const AUTO_TRANSFER_REMINDER_DAYS = 3;
  const autoTransferReminders = useMemo(() => {
    const today = todayISO();
    // Same UTC-component date-diff as snapshot.ts's daysBetween — never
    // `new Date(dateString)`, which parses a date-only string as UTC
    // midnight and reads a day early in negative-UTC-offset timezones.
    const daysUntil = (dateStr: string) => {
      const [ay, am, ad] = today.split("-").map(Number);
      const [by, bm, bd] = dateStr.split("-").map(Number);
      return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
    };
    return autoTransfers
      .filter((a) => a.is_active !== false)
      .map((a) => {
        const info = deriveAutoTransferState(a, transactions, today);
        const overdueFlag = isAutoTransferOverdue(a, info, today);
        const daysUntilDue = daysUntil(a.next_due_date);
        return {
          at: a,
          state: info.state,
          overdue: overdueFlag,
          dueSoon: !overdueFlag && info.state === "unpaid" && daysUntilDue <= AUTO_TRANSFER_REMINDER_DAYS,
        };
      })
      .filter((r) => r.state === "unpaid")
      .sort((a, b) => a.at.next_due_date.localeCompare(b.at.next_due_date));
  }, [autoTransfers, transactions]);

  /**
   * ADR-082: Past Due splits three ways. Paycheck-deduction and HSA/FSA items
   * are settled automatically off a paycheck — shown for awareness, collapsed
   * by default (one shared toggle), and never mixed in with ordinary bills the
   * household actually has to go pay.
   */
  const overduePaycheck = overdue.filter((o) => o.group === "paycheck_deduction");
  const overdueHsaFsa = overdue.filter((o) => o.group === "hsa_fsa");
  const overdueRest = overdue.filter((o) => o.group === "other");
  const overduePaycheckTotal = overduePaycheck.reduce((sum, o) => sum + o.amount, 0);
  const overdueHsaFsaTotal = overdueHsaFsa.reduce((sum, o) => sum + o.amount, 0);
  const hasAutoHandledOverdue = overduePaycheck.length > 0 || overdueHsaFsa.length > 0;
  const [overdueDeductionsOpen, setOverdueDeductionsOpen] = useState(false);

  /** Payoff progress is collapsed by default to keep the dashboard short. */
  const [payoffOpen, setPayoffOpen] = useState(false);

  /** ADR-095: locked-plan scoreboard, null when the strategy isn't locked. */
  const payoffCmp = useMemo(
    () => baselineComparison(strategySettings, debts),
    [strategySettings, debts],
  );




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
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest opacity-80">
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
                  Every bill, minimum debt payment, and auto-transfer due
                  inside this {period.label} — the full amount owed/scheduled
                  on each, not what's already been paid this {period.label}
                  and not money set aside anywhere. "Still owed this{" "}
                  {period.label}" below is what's actually left to pay
                  (bills/debts only — auto-transfers have their own card).
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
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="min-w-0 rounded-[12px] bg-brand-foreground/15 p-2.5">
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  Bills this {period.label}
                  <HelpButton>
                    Every bill due this {period.label}, at its full due-date
                    amount — includes bills already partly or fully paid this
                    {" "}{period.label}.
                  </HelpButton>
                </p>
                <p className="truncate text-base font-bold tabular-nums sm:text-xl">
                  {formatMoney(periodTotals.bills)}
                </p>
              </div>
              <div className="min-w-0 rounded-[12px] bg-brand-foreground/15 p-2.5">
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  Debts this {period.label}
                  <HelpButton>
                    Every debt's minimum payment due this {period.label}, at
                    the full amount — includes debts already partly or fully
                    paid this {period.label}.
                  </HelpButton>
                </p>
                <p className="truncate text-base font-bold tabular-nums sm:text-xl">
                  {formatMoney(periodTotals.debts)}
                </p>
              </div>
              <div className="min-w-0 rounded-[12px] bg-brand-foreground/15 p-2.5">
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest opacity-80">
                  {AUTO_TRANSFER_ICON} this {period.label}
                  <HelpButton>
                    Recurring auto-transfers due this {period.label} (ADR-081)
                    — money the bank moves automatically between your own
                    accounts. Nothing is owed to anyone; this just counts
                    toward what the paycheck needs to cover.
                  </HelpButton>
                </p>
                <p className="truncate text-base font-bold tabular-nums sm:text-xl">
                  {formatMoney(periodTotals.autoTransfers)}
                </p>
              </div>
            </div>
          </div>
          <div className="h-2 w-full bg-brand-foreground/20">
            <div className="h-full bg-brand-foreground/85" style={{ width: `${paidPct}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 py-1">
          <button
            type="button"
            onClick={() => setViewPersist("simple")}
            className={
              view === "simple"
                ? "text-base font-semibold"
                : "text-base text-muted-foreground"
            }
          >
            Simple
          </button>
          <span className="scale-125">
            <Switch
              checked={view === "more"}
              onCheckedChange={(v) => setViewPersist(v ? "more" : "simple")}
              aria-label="Dashboard detail level"
            />
          </span>
          <button
            type="button"
            onClick={() => setViewPersist("more")}
            className={
              view === "more"
                ? "text-base font-semibold"
                : "text-base text-muted-foreground"
            }
          >
            More Info
          </button>
        </div>

        {view === "simple" ? (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {formatWindow(period.start, period.end)}
            </p>

            <Card className="overflow-hidden">
              <CardContent
                className="flex items-center justify-between p-4"
                style={{ backgroundColor: "color-mix(in oklab, var(--state-cleared) 15%, transparent)" }}
              >
                <span
                  className="flex items-center gap-2 text-base font-bold"
                  style={{ color: "var(--state-cleared)" }}
                >
                  <span aria-hidden>💵</span>
                  Income this {period.label}
                </span>
                <span
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: "var(--state-cleared)" }}
                >
                  {formatMoney(incomeThisPeriod)}
                </span>
              </CardContent>
            </Card>

            <StatusBreakdownCard title="Bills" icon="🧾" accent="var(--chart-1)" status={billsStatus} />
            <StatusBreakdownCard title="Debts" icon="🏦" accent="var(--chart-2)" status={debtsStatus} />

            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Spend
                </p>
                <BudgetTotals rows={simpleSpendGroups} />
                <div className="mt-3 space-y-2">
                  {simpleSpendGroups.map((g, i) => (
                    <SimpleSpendTile
                      key={g.name}
                      group={g}
                      index={i}
                      transactions={transactions}
                      period={period}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {view === "more" ? (
          <>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
              <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
              <div className="mt-3 space-y-2">
                {budgetChart.map((g, i) => (
                  <BudgetTile key={g.name} group={g} index={i} />
                ))}
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Tap a category for the spending / bills / debts split
              </p>
            </CardContent>
          </Card>
        )}





        {spendingByCategory.rows.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Payoff progress
                </span>
                {payoffOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {payoffCmp ? (
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Locked plan</span>
                  <span
                    className={`font-semibold ${
                      payoffCmp.status === "ahead"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : payoffCmp.status === "behind"
                          ? "text-destructive"
                          : "text-muted-foreground"
                    }`}
                  >
                    {comparisonLabel(payoffCmp)}
                  </span>
                </div>
              ) : null}
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
                      <p className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
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
              {hasAutoHandledOverdue ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOverdueDeductionsOpen((v) => !v)}
                    aria-expanded={overdueDeductionsOpen}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Auto-handled off paycheck ·{" "}
                      {overduePaycheck.length + overdueHsaFsa.length} ·{" "}
                      {formatMoney(overduePaycheckTotal + overdueHsaFsaTotal)}
                    </span>
                    {overdueDeductionsOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {overdueDeductionsOpen ? (
                    <div className="space-y-3">
                      {overduePaycheck.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Paycheck deduction · {formatMoney(overduePaycheckTotal)}
                          </p>
                          {overduePaycheck.map((o) => (
                            <OverdueRow key={o.id} item={o} />
                          ))}
                        </div>
                      ) : null}
                      {overdueHsaFsa.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                            HSA / FSA · {formatMoney(overdueHsaFsaTotal)}
                          </p>
                          {overdueHsaFsa.map((o) => (
                            <OverdueRow key={o.id} item={o} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {overdueRest.length > 0 ? (
                <div className="space-y-2">
                  {hasAutoHandledOverdue ? (
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
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

        {/* ADR-081: kept separate from Bills/Debts — no vendor, nothing owed,
            just a reminder to confirm an auto-transfer actually landed. */}
        {autoTransferReminders.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span aria-hidden>{AUTO_TRANSFER_ICON}</span>
                <h2 className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide">
                  Auto-Transfers
                  <HelpButton>
                    Recurring transfers the bank makes automatically between
                    your own accounts. There's no vendor and nothing is
                    actually owed — "Check on this" just means the due date
                    passed and the app hasn't been told it happened yet.
                  </HelpButton>
                </h2>
              </div>
              <div className="space-y-2">
                {autoTransferReminders.map((r) => (
                  <div key={r.at.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.at.name}</span>
                    {r.overdue ? (
                      <span className="rounded-full bg-state-pending/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-state-pending">
                        Check on this
                      </span>
                    ) : (
                      <span
                        className={
                          r.dueSoon
                            ? "text-xs font-medium text-state-pending"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        Due {r.at.next_due_date}
                      </span>
                    )}
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMoney(Number(r.at.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {monthlySummary.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
              <div className="mt-3 space-y-2">
                {monthlySummary.map((g, i) => (
                  <MonthlySummaryTile key={g.name} group={g} index={i} />
                ))}
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                Tap a category for the spending / bills / debts split
              </p>
            </CardContent>
          </Card>
        )}

        {netWorthData.length > 1 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
          </>
        ) : null}
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
  spendingPending: number;
  billsPending: number;
  debtsPending: number;
  /** ADR-032/068: payroll/HSA-funded debts — shown, never budgeted. */
  deductedBudgeted: number;
  deductedSpent: number;
  deductedPending: number;
  /** Categories rolled into this tile — used for transaction drill-down. */
  categoryIds: string[];
  periodStart: string;
  periodEnd: string;
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

/** ADR-096: Simple view's Bills/Debts total + paid/pending/overdue/remaining. */
function StatusBreakdownCard({
  title,
  icon,
  accent,
  status,
}: {
  title: string;
  icon: string;
  accent: string;
  status: { total: number; paid: number; pending: number; overdue: number };
}) {
  const paidPct = status.total > 0 ? Math.min(100, (status.paid / status.total) * 100) : 0;
  const pendingPct = status.total > 0 ? (status.pending / status.total) * 100 : 0;
  const remaining = Math.max(0, status.total - status.paid);
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: `color-mix(in oklab, ${accent} 15%, transparent)` }}
      >
        <span className="flex items-center gap-2 text-base font-bold" style={{ color: accent }}>
          <span aria-hidden>{icon}</span>
          {title}
        </span>
        <span className="text-lg font-extrabold tabular-nums" style={{ color: accent }}>
          {formatMoney(status.total)}
        </span>
      </div>
      <CardContent className="space-y-2 p-4 text-sm">
        <ItemBar value={paidPct} pendingValue={pendingPct} color={budgetRingColor(status.paid, status.total)} />
        <div className="flex items-center justify-between pt-1">
          <span className="text-muted-foreground">Paid so far</span>
          <span className="font-medium tabular-nums">{formatMoney(status.paid)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Remaining</span>
          <span className="font-medium tabular-nums">{formatMoney(remaining)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pending</span>
          <span className="font-medium tabular-nums">{formatMoney(status.pending)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            Overdue
            <HelpButton>
              &apos;Remaining&apos; above is what&apos;s left of the total due
              this period. &apos;Overdue&apos; is different: money still owed
              from cycles before this period — {title.toLowerCase()} that
              already missed a due date.
            </HelpButton>
          </span>
          <span
            className={
              status.overdue > 0.005
                ? "font-medium tabular-nums text-destructive"
                : "font-medium tabular-nums"
            }
          >
            {formatMoney(status.overdue)}
          </span>
        </div>
      </CardContent>
    </Card>
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
  /** ADR-082: which Past Due bucket this row sorts into. */
  group?: PastDueGroup;
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
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {o.funding}
              </span>
            ) : null}
          </p>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
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

/** Compact tile per parent category — ring first, numbers on tap.
 *  The ring is a STATUS indicator: it includes deduction-funded obligations
 *  (payroll/HSA, ADR-032/068) and shows pending as an amber arc, even though
 *  those amounts stay out of the budgeting labels below. */
function BudgetTile({ group: g, index: i }: { group: BudgetGroup; index: number }) {
  const [open, setOpen] = useState(false);
  const statusPaid = g.actual + (g.deductedSpent ?? 0);
  const statusPending = (g.spendingPending ?? 0) + (g.billsPending ?? 0) +
    (g.debtsPending ?? 0) + (g.deductedPending ?? 0);
  const statusTotal = Math.max(
    g.budgeted + (g.deductedBudgeted ?? 0),
    statusPaid,
  );
  const pct = statusTotal
    ? Math.min(100, (statusPaid / statusTotal) * 100)
    : statusPaid > 0
      ? 100
      : 0;
  const pendingPct = statusTotal ? (statusPending / statusTotal) * 100 : 0;
  const over = g.budgeted > 0 && g.actual > g.budgeted;
  const spentNoBudget = g.budgeted === 0 && g.actual > 0;
  const color = budgetRingColor(statusPaid, statusTotal);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full rounded-[14px] bg-muted/40 p-3 text-left active:bg-muted"
      aria-expanded={open}
    >
      <div className="flex items-center gap-2">
        <ProgressRing value={pct} pendingValue={pendingPct} color={color} size={44} />

        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span aria-hidden>{emojiFor(g.name)}</span>
            <span className="truncate">{g.name}</span>
          </span>
          <span
            className={
              over || spentNoBudget
                ? "text-xs uppercase tracking-widest text-destructive"
                : "text-xs uppercase tracking-widest text-muted-foreground"
            }
          >
            {over
              ? `${formatMoney(g.actual - g.budgeted)} over`
              : spentNoBudget
                ? `${formatMoney(g.actual)} spent`
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
            spendingPending={g.spendingPending}
            billsPending={g.billsPending}
            debtsPending={g.debtsPending}
            deductedBudgeted={g.deductedBudgeted}
            deductedSpent={g.deductedSpent}
            deductedPending={g.deductedPending}
            drill={{
              categoryIds: g.categoryIds,
              label: g.name,
              dateFrom: g.periodStart,
              dateTo: g.periodEnd,
            }}
          />
        </div>
      ) : null}
    </button>
  );
}

/**
 * ADR-096: Simple view's category tile — same collapsed ring/header as
 * `BudgetTile` (spending-only, so its budgeted/actual numbers already read
 * correctly with no bills/debts to mix in), but expands to an
 * institution-by-institution spend breakdown instead of `BudgetSplitLines`,
 * matching `app.spending-by-place.tsx`'s row exactly.
 */
function SimpleSpendTile({
  group: g,
  index: i,
  transactions,
  period,
}: {
  group: BudgetGroup;
  index: number;
  transactions: Transaction[];
  period: { start: string; end: string };
}) {
  const [open, setOpen] = useState(false);
  const { data: institutions = [] } = useInstitutions();
  const pct = g.budgeted ? Math.min(100, (g.actual / g.budgeted) * 100) : g.actual > 0 ? 100 : 0;
  const pendingPct = g.budgeted ? (g.spendingPending / g.budgeted) * 100 : 0;
  const over = g.budgeted > 0 && g.actual > g.budgeted;
  const spentNoBudget = g.budgeted === 0 && g.actual > 0;
  const color = budgetRingColor(g.actual, g.budgeted);

  const byPlace = useMemo(() => {
    if (!open) return [];
    const categoryIds = new Set(g.categoryIds);
    const internal = internalTransferIds(transactions);
    const byId = new Map<string, number>();
    for (const t of transactions) {
      if (!t.institution_id || !t.category_id || !categoryIds.has(t.category_id)) continue;
      // Plain spending only — a bill/debt payment can carry the same
      // category_id as this group's spending categories (e.g. an ATT bill
      // filed under "Home & Garden"), but its money isn't spending, same
      // distinction actualByCategoryInRange already makes for the ring/total.
      if (t.linked_bill_id || t.linked_debt_id) continue;
      if (t.transfer_group_id && internal.has(t.transfer_group_id)) continue;
      const date = (t.transaction_date ?? "").slice(0, 10);
      if (!(date >= period.start && date < period.end)) continue;
      const spent = -Number(t.amount ?? 0);
      if (spent <= 0) continue;
      byId.set(t.institution_id, (byId.get(t.institution_id) ?? 0) + spent);
    }
    return [...byId.entries()]
      .map(([id, amount]) => ({ id, amount, institution: institutions.find((inst) => inst.id === id) ?? null }))
      .sort((a, b) => b.amount - a.amount);
  }, [open, g.categoryIds, transactions, period, institutions]);
  const byPlaceTotal = byPlace.reduce((s, r) => s + r.amount, 0);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full rounded-[14px] bg-muted/40 p-3 text-left active:bg-muted"
      aria-expanded={open}
    >
      <div className="flex items-center gap-2">
        <ProgressRing value={pct} pendingValue={pendingPct} color={color} size={44} />

        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm font-medium">
            <span aria-hidden>{emojiFor(g.name)}</span>
            <span className="truncate">{g.name}</span>
          </span>
          <span
            className={
              over || spentNoBudget
                ? "text-xs uppercase tracking-widest text-destructive"
                : "text-xs uppercase tracking-widest text-muted-foreground"
            }
          >
            {over
              ? `${formatMoney(g.actual - g.budgeted)} over`
              : spentNoBudget
                ? `${formatMoney(g.actual)} spent`
                : `${formatMoney(g.budgeted - g.actual)} left`}
          </span>
        </div>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {formatMoney(g.actual)} of {formatMoney(g.budgeted)} budgeted
          </p>
          {byPlace.length === 0 ? (
            <p className="rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
              No institution-tagged spending yet this period.
            </p>
          ) : (
            byPlace.map((r, idx) => {
              const share = byPlaceTotal > 0 ? (r.amount / byPlaceTotal) * 100 : 0;
              const placeColor = itemColor(idx);
              return (
                <div key={r.id} className="space-y-1" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    {r.institution?.logo_url ? (
                      <img
                        src={r.institution.logo_url}
                        alt=""
                        className="h-6 w-6 rounded-full object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
                        style={{ backgroundColor: `${placeColor}33` }}
                      >
                        🏪
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {r.institution?.name ?? "Unknown place"}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {formatMoney(r.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, share)}%`, backgroundColor: placeColor }}
                      />
                    </div>
                    <span className="w-8 text-right text-[10px] text-muted-foreground">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </button>
  );
}

/** Last calendar day of a YYYY-MM-01 month key, as YYYY-MM-DD. */
function monthEndISO(monthKeyValue: string): string {
  const [y, m] = monthKeyValue.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${monthKeyValue.slice(0, 7)}-${String(last).padStart(2, "0")}`;
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
  categoryIds: string[];
  /** YYYY-MM the figures cover. */
  month: string;
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
  const color = budgetRingColor(g.actual, g.budgetTarget);
  const vsAverage = g.actual - g.trailingAverage;
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full rounded-[14px] bg-muted/40 p-3 text-left active:bg-muted"
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
            drill={{
              categoryIds: g.categoryIds,
              label: g.name,
              // `g.month` is already a YYYY-MM-01 key (monthKey), so the range
              // is that day through the real last day of the month.
              dateFrom: g.month,
              dateTo: monthEndISO(g.month),
            }}
          />
        </div>
      ) : null}
    </button>
  );
}
