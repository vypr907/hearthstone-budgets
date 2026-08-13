import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAccounts,
  useCategories,
  useSavingsGoals,
  useSpendingActuals,
  useTransactions,
  monthKey,
  shiftMonth,
} from "@/lib/data-hooks";
import { buildActualResolver } from "@/lib/spending-actuals";
import { useBills, useDebts } from "@/lib/data-hooks";
import {
  useDeleteIncomeEvent,
  useIncomeEvents,
  useIncomeSourceSplits,
  useIncomeSources,
  usePayPeriodAllocations,
  useSetAllocation,
  useUpsertIncomeEvent,
  useMarkIncomeReceived,
  useUpsertIncomeSource,
} from "@/lib/income-hooks";
import { supabase } from "@/lib/supabase";
import {
  eventAmount,
  eventDate,
  inRange,
  isReceived,
  obligationsInRange,
  deductedObligationsInRange,
  periodRange,
  sum,
} from "@/lib/paycheck-budget";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYCHECK_DEDUCTION_ICON, categoryVisual } from "@/lib/visual-meta";
import { Plus } from "lucide-react";

/**
 * ADR-047 follow-up: returns true when the income source has at least one
 * split row that resolves to a deposit (a fixed row with an account + amount,
 * or a remainder row with an account). Used to decide whether "Mark received"
 * can stay one-tap or needs an account prompt.
 */
async function hasUsableSplits(incomeSourceId: string | null | undefined) {
  if (!incomeSourceId) return false;
  const { data, error } = await supabase
    .from("income_source_splits")
    .select("split_type,amount,account_id")
    .eq("income_source_id", incomeSourceId);
  if (error) return false;
  for (const s of data ?? []) {
    const isRemainder = (s.split_type ?? "fixed").toLowerCase() === "remainder";
    const hasAccount = !!s.account_id;
    const hasAmount = isRemainder ? true : Number(s.amount ?? 0) > 0;
    if (hasAccount && hasAmount) return true;
  }
  return false;
}

export const Route = createFileRoute("/app/paycheck")({
  head: () => ({
    meta: [
      { title: "Paycheck Budget — Hearthstone" },
      {
        name: "description",
        content:
          "Budget each paycheck: see the pay period's bills and debts, extra income, and allocate what's left across spending categories.",
      },
      { property: "og:title", content: "Paycheck Budget — Hearthstone" },
      {
        property: "og:description",
        content:
          "Plan every pay period in Hearthstone — obligations, extra income, and per-category allocations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaycheckPage,
});

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

function PaycheckPage() {
  const { data: sources = [] } = useIncomeSources();
  const { data: events = [] } = useIncomeEvents();
  const { data: allocations = [] } = usePayPeriodAllocations();
  const { data: categories = [] } = useCategories();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();

  const primarySource = sources.find((s) => s.is_primary) ?? null;
  const primaryEvents = useMemo(
    () =>
      events
        .filter((e) => e.income_source_id && e.income_source_id === primarySource?.id)
        .sort((a, b) => (eventDate(a) ?? "").localeCompare(eventDate(b) ?? "")),
    [events, primarySource?.id],
  );

  const [selectedId, setSelectedId] = useState<string>("");
  useEffect(() => {
    if (selectedId && primaryEvents.some((e) => e.id === selectedId)) return;
    if (primaryEvents.length === 0) {
      setSelectedId("");
      return;
    }
    const today = todayISO();
    const upcoming = primaryEvents.find((e) => (eventDate(e) ?? "") >= today);
    setSelectedId((upcoming ?? primaryEvents[primaryEvents.length - 1]).id);
  }, [primaryEvents, selectedId]);

  const selected = primaryEvents.find((e) => e.id === selectedId) ?? null;
  const range = selected ? periodRange(selected, primaryEvents) : null;

  return (
    <>
      <AppHeader title="Paycheck Budget" />
      <div className="space-y-4 p-4">
        <Tabs defaultValue="budget">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>

          <TabsContent value="budget" className="mt-4 space-y-4">
            {!primarySource ? (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Mark one income source as primary on the Income tab to start budgeting paychecks.
                </CardContent>
              </Card>
            ) : primaryEvents.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Add a pay date for {primarySource.name} on the Income tab.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <Label>Pay date</Label>
                    <Select value={selectedId} onValueChange={setSelectedId}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Pick a pay date" />
                      </SelectTrigger>
                      <SelectContent>
                        {primaryEvents.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {eventDate(e) ?? "no date"} · {formatMoney(eventAmount(e))} ·{" "}
                            {isReceived(e) ? "received" : "expected"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {range ? (
                      <p className="text-sm text-muted-foreground">
                        Period: {range.start} → {range.end}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                {selected && range ? (
                  <PeriodBudget
                    key={selected.id}
                    event={selected}
                    start={range.start}
                    end={range.end}
                    events={events}
                    primarySourceId={primarySource.id}
                    bills={bills}
                    debts={debts}
                    categories={categories}
                    allocations={allocations}
                  />
                ) : null}
              </>
            )}
          </TabsContent>

          <TabsContent value="trends" className="mt-4">
            <TrendsView events={primaryEvents} allocations={allocations} categories={categories} />
          </TabsContent>

          <TabsContent value="income" className="mt-4">
            <IncomeAdmin sources={sources} events={events} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

type Cat = { id: string; name: string; domain?: string | null };

function spendingCategories(categories: Cat[]) {
  const spending = categories.filter((c) => (c.domain ?? "").toLowerCase() === "spending");
  return spending.length > 0 ? spending : categories;
}

function PeriodBudget({
  event,
  start,
  end,
  events,
  primarySourceId,
  bills,
  debts,
  categories,
  allocations,
}: {
  event: import("@/lib/supabase").IncomeEvent;
  start: string;
  end: string;
  events: import("@/lib/supabase").IncomeEvent[];
  primarySourceId: string;
  bills: import("@/lib/supabase").Bill[];
  debts: import("@/lib/supabase").Debt[];
  categories: Cat[];
  allocations: import("@/lib/supabase").PayPeriodAllocation[];
}) {
  const setAllocation = useSetAllocation();
  const { data: splits = [] } = useIncomeSourceSplits(primarySourceId);
  const { data: accounts = [] } = useAccounts();
  const { data: goals = [] } = useSavingsGoals();
  const { data: spendActuals = [] } = useSpendingActuals();
  const { data: allTransactions = [] } = useTransactions();

  // Per-category spend history: last completed month and 3-month average,
  // resolved through the same ledger/override rules as the Spending screen.
  const spendHistory = useMemo(() => {
    const resolver = buildActualResolver(spendActuals, allTransactions, bills);
    const thisMonth = monthKey();
    const lastMonth = shiftMonth(thisMonth, -1);
    const window = [1, 2, 3].map((n) => shiftMonth(thisMonth, -n));
    const out = new Map<string, { last: number | null; avg: number | null }>();
    for (const c of categories) {
      const seen = window.filter((m) => resolver.has(c.id, m));
      out.set(c.id, {
        last: resolver.has(c.id, lastMonth) ? resolver.resolve(c.id, lastMonth).amount : null,
        avg: seen.length
          ? seen.reduce((s, m) => s + resolver.resolve(c.id, m).amount, 0) / seen.length
          : null,
      });
    }
    return out;
  }, [spendActuals, allTransactions, bills, categories]);

  const obligations = useMemo(
    // ADR-060: project recurrences forward through the end of this period so
    // future pay periods show what will come due, marked as projected.
    () => obligationsInRange(bills, debts, start, end, end),
    [bills, debts, start, end],
  );
  const obligationsTotal = sum(obligations.map((o) => o.amount));
  // ADR-032: shown for awareness, never subtracted from the paycheck.
  const deducted = useMemo(
    () => deductedObligationsInRange(debts, start, end),
    [debts, start, end],
  );

  const secondary = useMemo(
    () =>
      events.filter(
        (e) => e.income_source_id !== primarySourceId && inRange(eventDate(e), start, end),
      ),
    [events, primarySourceId, start, end],
  );
  const secondaryTotal = sum(secondary.map(eventAmount));

  const cats = useMemo(() => spendingCategories(categories), [categories]);
  const catGroups = useMemo(() => {
    const map = new Map<string, typeof cats>();
    for (const c of cats) {
      const key = (c as { parent_category?: string | null }).parent_category?.trim() || "Ungrouped";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([parent, rows]) =>
          [parent, rows.slice().sort((a, b) => a.name.localeCompare(b.name))] as const,
      );
  }, [cats]);
  const mine = useMemo(
    () => allocations.filter((a) => a.income_event_id === event.id),
    [allocations, event.id],
  );
  const rowFor = (categoryId: string) => mine.find((a) => a.category_id === categoryId);
  // ADR-039: goal-based allocation rows live in the same table, keyed by goal_id.
  const goalRowFor = (goalId: string) => mine.find((a) => a.goal_id === goalId);

  const [draft, setDraft] = useState<Record<string, number>>({});
  const valueFor = (categoryId: string) =>
    draft[categoryId] ?? Number(rowFor(categoryId)?.allocated_amount ?? 0);
  const goalValueFor = (goalId: string) =>
    draft[`goal:${goalId}`] ?? Number(goalRowFor(goalId)?.allocated_amount ?? 0);

  // ADR-059: manually planned bill/debt payments for this pay period. These are
  // independent of the due-date bucketing in "Due this period" — an item can be
  // in both, and we deliberately do not deduplicate.
  const planned = useMemo(() => {
    const rows: {
      allocationId: string;
      kind: "bill" | "debt";
      targetId: string;
      name: string;
      amount: number;
    }[] = [];
    for (const a of mine) {
      if (a.bill_id) {
        const b = bills.find((x) => x.id === a.bill_id);
        rows.push({
          allocationId: a.id,
          kind: "bill",
          targetId: a.bill_id,
          name: b?.name ?? "Bill",
          amount: Number(a.allocated_amount ?? 0),
        });
      } else if (a.debt_id) {
        const d = debts.find((x) => x.id === a.debt_id);
        rows.push({
          allocationId: a.id,
          kind: "debt",
          targetId: a.debt_id,
          name: d?.name ?? "Debt",
          amount: Number(a.allocated_amount ?? 0),
        });
      }
    }
    return rows.sort((x, y) => x.name.localeCompare(y.name));
  }, [mine, bills, debts]);
  const plannedTotal = sum(planned.map((p) => p.amount));

  const allocated =
    sum(cats.map((c) => valueFor(c.id))) +
    sum(goals.map((g) => goalValueFor(g.id))) +
    plannedTotal;
  const income = eventAmount(event) + secondaryTotal;
  const left = income - obligationsTotal - allocated;

  const commitPlanned = async (args: {
    id?: string;
    kind: "bill" | "debt";
    targetId: string;
    amount: number;
  }) => {
    try {
      await setAllocation.mutateAsync({
        id: args.id,
        incomeEventId: event.id,
        billId: args.kind === "bill" ? args.targetId : null,
        debtId: args.kind === "debt" ? args.targetId : null,
        amount: Math.max(0, Math.round(args.amount * 100) / 100),
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };


  const commit = async (categoryId: string, amount: number) => {
    try {
      await setAllocation.mutateAsync({
        id: rowFor(categoryId)?.id,
        incomeEventId: event.id,
        categoryId,
        amount: Math.max(0, Math.round(amount * 100) / 100),
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const commitGoal = async (goalId: string, amount: number) => {
    try {
      await setAllocation.mutateAsync({
        id: goalRowFor(goalId)?.id,
        incomeEventId: event.id,
        goalId,
        amount: Math.max(0, Math.round(amount * 100) / 100),
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sliderMax = Math.max(100, Math.ceil((income - obligationsTotal) / 50) * 50 || 100);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Paycheck ({isReceived(event) ? "received" : "expected"})
            </span>
            <span className="font-semibold">{formatMoney(eventAmount(event))}</span>
          </div>
          {secondary.map((e) => (
            <div key={e.id} className="flex items-center justify-between">
              <span className="text-muted-foreground">Extra income · {eventDate(e)}</span>
              <span className="font-medium">{formatMoney(eventAmount(e))}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-muted-foreground">Income this period</span>
            <span className="font-semibold">{formatMoney(income)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className="text-base font-semibold">Due this period</h2>
          {obligations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due in this range.</p>
          ) : (
            obligations.map((o) => (
              <div
                key={`${o.kind}-${o.id}-${o.dueDate}${o.projected ? "-p" : ""}`}
                className="flex items-center justify-between py-1 text-sm"
              >
                <span className="flex-1">
                  {o.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {o.kind} · {o.dueDate}
                  </span>
                  {o.projected ? (
                    <span className="ml-2 rounded border border-dashed px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Projected
                    </span>
                  ) : null}
                </span>
                <span className={o.projected ? "font-medium text-muted-foreground" : "font-medium"}>
                  {formatMoney(o.amount)}
                </span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
            <span>Obligations total</span>
            <span>{formatMoney(obligationsTotal)}</span>
          </div>
          {deducted.length > 0 ? (
            <div className="space-y-1 rounded-md bg-muted/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {PAYCHECK_DEDUCTION_ICON} Paycheck-deducted (not counted)
              </p>
              {deducted.map((o) => (
                <div
                  key={`ded-${o.id}`}
                  className="flex items-center justify-between text-sm text-muted-foreground"
                >
                  <span className="flex-1">
                    {PAYCHECK_DEDUCTION_ICON} {o.name}
                    <span className="ml-2 text-xs">{o.dueDate}</span>
                  </span>
                  <span>{formatMoney(o.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ADR-059: manually planned payments, deliberately separate from "Due this period". */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Planned</h2>
            <PlanPaymentDialog bills={bills} debts={debts} onSave={commitPlanned} />
          </div>
          {planned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing planned yet. Use “Plan a payment” to set money aside for a bill or debt in
              this period.
            </p>
          ) : (
            <>
              {planned.map((p) => (
                <div
                  key={p.allocationId}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    <span className="ml-2 text-xs text-muted-foreground">{p.kind} · planned</span>
                  </span>
                  <span className="font-medium">{formatMoney(p.amount)}</span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() =>
                      void commitPlanned({
                        id: p.allocationId,
                        kind: p.kind,
                        targetId: p.targetId,
                        amount: 0,
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
                <span>Planned total</span>
                <span>{formatMoney(plannedTotal)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>



      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-base font-semibold">Allocations</h2>
          {catGroups.map(([parent, rows]) => (
            <div key={parent} className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {parent}
              </p>
              {rows.map((c) => {
                const v = valueFor(c.id);
                const vis = categoryVisual(c);
                return (
                  <div
                    key={c.id}
                    className="space-y-2 border-l-4 pl-3"
                    style={{ borderColor: vis.color }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        aria-hidden
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-base"
                        style={{ background: `${vis.color}22` }}
                      >
                        {vis.icon}
                      </span>
                      <Label className="min-w-0 flex-1 truncate text-sm">{c.name}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-11 w-28 text-right"
                        value={v === 0 ? "" : String(v)}
                        placeholder="0"
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [c.id]: Number(e.target.value || 0) }))
                        }
                        onBlur={() => commit(c.id, v)}
                      />
                    </div>
                    <Slider
                      value={[Math.min(v, sliderMax)]}
                      max={sliderMax}
                      step={5}
                      onValueChange={([n]) => setDraft((d) => ({ ...d, [c.id]: n }))}
                      onValueCommit={([n]) => commit(c.id, n)}
                    />
                    {(() => {
                      const hist = spendHistory.get(c.id);
                      if (!hist || (hist.last == null && hist.avg == null)) return null;
                      const avg = hist.avg == null ? null : Math.round(hist.avg);
                      return (
                        <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>
                            Last month {hist.last == null ? "—" : formatMoney(hist.last)} · 3-mo avg{" "}
                            {hist.avg == null ? "—" : formatMoney(hist.avg)}
                          </span>
                          {avg != null && avg > 0 ? (
                            <button
                              type="button"
                              className="underline underline-offset-2 hover:text-foreground"
                              onClick={() => {
                                setDraft((d) => ({ ...d, [c.id]: avg }));
                                void commit(c.id, avg);
                              }}
                            >
                              Use avg
                            </button>
                          ) : null}
                        </p>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ))}
          {goals.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Savings goals
              </p>
              {goals.map((g) => {
                const v = goalValueFor(g.id);
                return (
                  <div key={g.id} className="space-y-2 border-l-4 border-primary/60 pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        aria-hidden
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-base"
                      >
                        {g.icon || "\u{1F3E6}"}
                      </span>
                      <Label className="min-w-0 flex-1 truncate text-sm">{g.name}</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-11 w-28 text-right"
                        value={v === 0 ? "" : String(v)}
                        placeholder="0"
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [`goal:${g.id}`]: Number(e.target.value || 0),
                          }))
                        }
                        onBlur={() => commitGoal(g.id, v)}
                      />
                    </div>
                    <Slider
                      value={[Math.min(v, sliderMax)]}
                      max={sliderMax}
                      step={5}
                      onValueChange={([n]) => setDraft((d) => ({ ...d, [`goal:${g.id}`]: n }))}
                      onValueCommit={([n]) => commitGoal(g.id, n)}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
            <span>Allocated</span>
            <span>{formatMoney(allocated)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {left < 0 ? "Over-allocated" : left === 0 ? "Fully allocated" : "Left to allocate"}
          </p>
          <p
            className={cn(
              "text-4xl font-bold tabular-nums",
              left < 0
                ? "text-destructive"
                : left === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-blue-600 dark:text-blue-400",
            )}
          >
            {formatMoney(left)}
          </p>
        </CardContent>
      </Card>

      {splits.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-base font-semibold">Deposit splits</h2>
            <p className="text-xs text-muted-foreground">
              How this paycheck deposits. Edit these in your source data.
            </p>
            {splits.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>
                  {accounts.find((a) => a.id === s.account_id)?.name ?? "Unassigned"}
                  {s.day_offset ? (
                    <span className="ml-2 text-xs text-muted-foreground">day +{s.day_offset}</span>
                  ) : null}
                </span>
                <span className="font-medium">
                  {(s.split_type ?? "").toLowerCase() === "remainder"
                    ? "Remainder"
                    : formatMoney(Number(s.amount ?? 0))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** ADR-059: pick a bill or debt and plan an amount against this pay period. */
function PlanPaymentDialog({
  bills,
  debts,
  onSave,
}: {
  bills: import("@/lib/supabase").Bill[];
  debts: import("@/lib/supabase").Debt[];
  onSave: (args: { kind: "bill" | "debt"; targetId: string; amount: number }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");

  const options = useMemo(
    () => [
      ...bills
        .filter((b) => b.is_active !== false)
        .map((b) => ({
          value: `bill:${b.id}`,
          label: b.name,
          amount: Number(b.cycle_amount_due ?? b.amount ?? 0),
        })),
      ...debts
        .filter((d) => !d.date_paid_off)
        .map((d) => ({
          value: `debt:${d.id}`,
          label: d.name,
          amount: Number(d.minimum_payment ?? 0),
        })),
    ],
    [bills, debts],
  );

  const save = async () => {
    if (!target) return;
    const [kind, id] = target.split(":");
    await onSave({ kind: kind as "bill" | "debt", targetId: id, amount: Number(amount || 0) });
    setOpen(false);
    setTarget("");
    setAmount("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-4 w-4" /> Plan a payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan a bill or debt payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Bill or debt</Label>
            <Select
              value={target}
              onValueChange={(v) => {
                setTarget(v);
                const opt = options.find((o) => o.value === v);
                if (opt && !amount && opt.amount > 0) setAmount(String(opt.amount));
              }}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Pick a bill or debt" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Planned amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              className="h-12"
              value={amount}
              placeholder="0"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void save()} disabled={!target || !Number(amount || 0)}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrendsView({

  events,
  allocations,
  categories,
}: {
  events: import("@/lib/supabase").IncomeEvent[];
  allocations: import("@/lib/supabase").PayPeriodAllocation[];
  categories: Cat[];
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const cats = useMemo(() => spendingCategories(categories), [categories]);
  const used = useMemo(
    () =>
      cats.filter((c) =>
        allocations.some((a) => a.category_id === c.id && Number(a.allocated_amount)),
      ),
    [cats, allocations],
  );

  const rows = useMemo(
    () =>
      [...events]
        .sort((a, b) => (eventDate(a) ?? "").localeCompare(eventDate(b) ?? ""))
        .map((e) => {
          const row: Record<string, string | number> = { date: eventDate(e) ?? "—" };
          let total = 0;
          for (const c of used) {
            const amount = sum(
              allocations
                .filter((a) => a.income_event_id === e.id && a.category_id === c.id)
                .map((a) => Number(a.allocated_amount ?? 0)),
            );
            row[c.name] = amount;
            total += amount;
          }
          row.Total = total;
          return row;
        }),
    [events, allocations, used],
  );

  const palette = [
    "hsl(var(--primary))",
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#db2777",
    "#0891b2",
    "#7c3aed",
    "#dc2626",
  ];

  if (rows.length === 0 || used.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Allocate money to categories on a paycheck to see trends here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Paycheck Trends</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "chart" ? "table" : "chart")}
          >
            {mode === "chart" ? "Table view" : "Chart view"}
          </Button>
        </div>

        {mode === "chart" ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: number) => formatMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {used.map((c, i) => (
                  <Bar key={c.id} dataKey={c.name} stackId="a" fill={palette[i % palette.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay date</TableHead>
                  {used.map((c) => (
                    <TableHead key={c.id} className="text-right">
                      {c.name}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={String(r.date)}>
                    <TableCell>{r.date}</TableCell>
                    {used.map((c) => (
                      <TableCell key={c.id} className="text-right">
                        {formatMoney(Number(r[c.name] ?? 0))}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      {formatMoney(Number(r.Total ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IncomeAdmin({
  sources,
  events,
}: {
  sources: import("@/lib/supabase").IncomeSource[];
  events: import("@/lib/supabase").IncomeEvent[];
}) {
  const upsertSource = useUpsertIncomeSource();
  const upsertEvent = useUpsertIncomeEvent();
  const deleteEvent = useDeleteIncomeEvent();
  const markReceived = useMarkIncomeReceived();
  const { data: accounts = [] } = useAccounts();
  const { data: ledger = [] } = useTransactions();
  /** ADR-047 backfill: paychecks marked received before deposits were written. */
  const hasDeposits = (eventId: string) =>
    ledger.some((t) => t.split_group_id === eventId);


  const [sourceOpen, setSourceOpen] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState("biweekly");
  const [isPrimary, setIsPrimary] = useState(false);
  const [typical, setTypical] = useState("");

  const [eventOpen, setEventOpen] = useState(false);
  const [editing, setEditing] = useState<import("@/lib/supabase").IncomeEvent | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [expectedDate, setExpectedDate] = useState(todayISO());
  const [expectedAmount, setExpectedAmount] = useState("");
  const [received, setReceived] = useState(false);
  const [actualDate, setActualDate] = useState("");
  const [actualAmount, setActualAmount] = useState("");

  // ADR-047 follow-up: account prompt when an income source has no usable
  // deposit splits. Holds the event awaiting an account + amount choice.
  const [depositPrompt, setDepositPrompt] = useState<{
    event: import("@/lib/supabase").IncomeEvent;
    sourceName: string;
  } | null>(null);
  const [depositAccountId, setDepositAccountId] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const openEvent = (e: import("@/lib/supabase").IncomeEvent | null) => {
    setEditing(e);
    setSourceId(e?.income_source_id ?? sources.find((s) => s.is_primary)?.id ?? "");
    setExpectedDate(e?.expected_date?.slice(0, 10) ?? todayISO());
    setExpectedAmount(e?.expected_amount != null ? String(e.expected_amount) : "");
    setReceived(!!e && isReceived(e));
    setActualDate(e?.actual_date?.slice(0, 10) ?? "");
    setActualAmount(e?.actual_amount != null ? String(e.actual_amount) : "");
    setEventOpen(true);
  };

  const saveSource = async () => {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await upsertSource.mutateAsync({
        name: name.trim(),
        cadence,
        is_primary: isPrimary,
        typical_amount: typical ? Number(typical) : null,
        is_active: true,
      });
      setSourceOpen(false);
      setName("");
      setTypical("");
      setIsPrimary(false);
      toast.success("Income source saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveEvent = async () => {
    if (!sourceId) return toast.error("Pick an income source");
    try {
      const saved = await upsertEvent.mutateAsync({
        ...(editing ? { id: editing.id } : {}),
        income_source_id: sourceId,
        expected_date: expectedDate || null,
        expected_amount: expectedAmount ? Number(expectedAmount) : null,
        actual_date: received ? actualDate || expectedDate : null,
        actual_amount: received && actualAmount ? Number(actualAmount) : null,
        status: received ? "received" : "expected",
      });
      // ADR-055: auto-post deposits for new received pay dates on save.
      // Editing an existing event skips this — the manual "Post deposits"
      // button handles backfilling already-passed dates.
      if (received && !editing && saved?.id) {
        const fakeEvent: import("@/lib/supabase").IncomeEvent = {
          id: saved.id,
          household_id: "",
          income_source_id: sourceId,
          expected_date: expectedDate || null,
          expected_amount: expectedAmount ? Number(expectedAmount) : null,
          actual_date: actualDate || expectedDate || null,
          actual_amount: actualAmount ? Number(actualAmount) : null,
          status: "received",
        };
        const usable = await hasUsableSplits(sourceId);
        if (usable) {
          try {
            const res = await markReceived.mutateAsync({
              event: fakeEvent,
              sourceName: sourceName(sourceId),
            });
            setEventOpen(false);
            toast.success(
              res.deposits > 0
                ? `Pay date saved · ${res.deposits} deposit${res.deposits === 1 ? "" : "s"} recorded`
                : "Pay date saved",
            );
            return;
          } catch (depositErr) {
            // Deposit failed — event is already saved, just warn.
            toast.error(`Pay date saved, but deposits failed: ${(depositErr as Error).message}`);
            setEventOpen(false);
            return;
          }
        }
      }
      setEventOpen(false);
      toast.success("Pay date saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const sourceName = (id: string | null) =>
    sources.find((s) => s.id === id)?.name ?? "Unknown source";

  async function receive(e: import("@/lib/supabase").IncomeEvent) {
    const sName = sourceName(e.income_source_id);
    // ADR-047 follow-up: only interrupt when the source has no usable deposit
    // splits. When splits exist, keep the one-tap behaviour.
    const usable = await hasUsableSplits(e.income_source_id);
    if (usable) {
      try {
        const res = await markReceived.mutateAsync({ event: e, sourceName: sName });
        toast.success(
          res.deposits > 0
            ? `Paycheck received · ${res.deposits} deposit${res.deposits === 1 ? "" : "s"} recorded`
            : "Paycheck received",
        );
      } catch (err) {
        toast.error((err as Error).message);
      }
      return;
    }
    setDepositAccountId("");
    setDepositAmount(eventAmount(e) ? String(eventAmount(e)) : "");
    setDepositPrompt({ event: e, sourceName: sName });
  }

  async function confirmDeposit() {
    if (!depositPrompt) return;
    if (!depositAccountId) return toast.error("Pick an account");
    const amt = Number(depositAmount || 0);
    if (!amt) return toast.error("Enter the amount received");
    try {
      const res = await markReceived.mutateAsync({
        event: depositPrompt.event,
        sourceName: depositPrompt.sourceName,
        actualAmount: amt,
        accountId: depositAccountId,
      });
      toast.success(
        res.deposits > 0
          ? `Paycheck received · ${res.deposits} deposit${res.deposits === 1 ? "" : "s"} recorded`
          : "Paycheck received",
      );
      setDepositPrompt(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Income sources</h2>
            <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-10">
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New income source</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      className="h-11"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cadence</Label>
                    <Select value={cadence} onValueChange={setCadence}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["weekly", "biweekly", "semimonthly", "monthly", "irregular"].map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Typical amount</Label>
                    <Input
                      className="h-11"
                      type="number"
                      inputMode="decimal"
                      value={typical}
                      onChange={(e) => setTypical(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={isPrimary}
                      onCheckedChange={(v) => setIsPrimary(v === true)}
                    />
                    Primary job (only one)
                  </label>
                </div>
                <DialogFooter>
                  <Button className="h-11 w-full" onClick={saveSource}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No income sources yet.</p>
          ) : (
            sources.map((s) => {
              // ADR-054: each source is a card that opens its own detail view.
              const mine = events.filter((e) => e.income_source_id === s.id);
              const received = mine.filter((e) => isReceived(e));
              const ytd = received
                .filter((e) => (eventDate(e) ?? "").startsWith(String(new Date().getFullYear())))
                .reduce((sum, e) => sum + eventAmount(e), 0);
              return (
                <Link
                  key={s.id}
                  to="/app/income-source/$id"
                  params={{ id: s.id }}
                  className="block rounded-[14px] border border-border bg-card p-3 active:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.cadence ?? "cadence unset"} · {received.length} received
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatMoney(Number(s.typical_amount ?? 0))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatMoney(ytd)} this year
                      </p>
                    </div>
                  </div>
                  {s.is_primary ? (
                    <Badge className="mt-2">Primary</Badge>
                  ) : null}
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Pay dates</h2>
            <Button size="sm" className="h-10" onClick={() => openEvent(null)}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pay dates yet.</p>
          ) : (
            [...events]
              .sort((a, b) => (eventDate(b) ?? "").localeCompare(eventDate(a) ?? ""))
              .map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <button
                    className="flex flex-1 items-center justify-between rounded-md py-2 text-left text-sm hover:bg-muted"
                    onClick={() => openEvent(e)}
                  >
                    <span>
                      {eventDate(e) ?? "—"}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {sourceName(e.income_source_id)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={isReceived(e) ? "default" : "secondary"}>
                        {isReceived(e) ? "received" : "expected"}
                      </Badge>
                      <span className="font-medium">{formatMoney(eventAmount(e))}</span>
                    </span>
                  </button>
                  {/* ADR-047: marking received also writes the source's split deposits. */}
                  {!isReceived(e) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0"
                      disabled={markReceived.isPending}
                      onClick={() => void receive(e)}
                    >
                      Mark received
                    </Button>
                  ) : !hasDeposits(e.id) ? (
                    // Older paychecks were marked received before deposits were
                    // written; the same idempotent flow backfills the ledger.
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 shrink-0"
                      disabled={markReceived.isPending}
                      onClick={() => void receive(e)}
                    >
                      Post deposits
                    </Button>
                  ) : null}

                </div>
              ))
          )}
        </CardContent>
      </Card>

      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit pay date" : "New pay date"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pick a source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.is_primary ? " (primary)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Expected date</Label>
              <Input
                className="h-11"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Expected amount</Label>
              <Input
                className="h-11"
                type="number"
                inputMode="decimal"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={received} onCheckedChange={(v) => setReceived(v === true)} />
              Received
            </label>
            {received ? (
              <>
                <div className="space-y-1">
                  <Label>Actual date</Label>
                  <Input
                    className="h-11"
                    type="date"
                    value={actualDate}
                    onChange={(e) => setActualDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Actual amount</Label>
                  <Input
                    className="h-11"
                    type="number"
                    inputMode="decimal"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            {editing ? (
              <Button
                variant="outline"
                className="h-11"
                onClick={async () => {
                  try {
                    await deleteEvent.mutateAsync(editing.id);
                    setEventOpen(false);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Delete
              </Button>
            ) : null}
            <Button className="h-11 flex-1" onClick={saveEvent}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!depositPrompt}
        onOpenChange={(o) => !o && setDepositPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit this paycheck</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {depositPrompt?.sourceName ?? "This income source"} has no deposit
            splits configured. Pick the account to record this deposit into.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Account</Label>
              <Select value={depositAccountId} onValueChange={setDepositAccountId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                className="h-11"
                type="number"
                inputMode="decimal"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setDepositPrompt(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-11 flex-1"
              onClick={confirmDeposit}
              disabled={markReceived.isPending}
            >
              {markReceived.isPending ? "Saving…" : "Mark received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
