import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useBills,
  useDebts,
  useCategories,
  useResetDebtsMonth,
} from "@/lib/data-hooks";
import { usePayFlow } from "@/lib/pay-flow";
import { toPayable, type Payable } from "@/lib/payments";
import { useCycleState, stateVisual, type CycleInfo, type LedgerState } from "@/lib/ledger-state";
import { formatMoney, debtDueDate } from "@/lib/format";
import { useIncomeSources, useIncomeEvents } from "@/lib/income-hooks";
import { currentPayPeriod, currentMonthWindow, dueInPeriod } from "@/lib/pay-period";
import { todayISO } from "@/lib/snapshot";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { Bill, Debt } from "@/lib/supabase";
import { StatusBadge } from "@/components/detail";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { ListControls, groupRows } from "@/components/ListControls";
import { BillDetailDialog, BillDialog } from "@/routes/app.bills";
import { DebtDetailDialog, DebtDialog } from "@/routes/app.debts";

export const Route = createFileRoute("/app/everything")({
  head: () => ({
    meta: [
      { title: "Everything — Hearthstone" },
      {
        name: "description",
        content:
          "See all household bills and debts in one filterable, sortable list and mark payments in Hearthstone.",
      },
      { property: "og:title", content: "Everything — Hearthstone" },
      {
        property: "og:description",
        content:
          "See all household bills and debts in one filterable, sortable list and mark payments in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EverythingPage,
});

/** Emoji markers replace the old "Bill" / "Debt" text label. */
const KIND_EMOJI = { Bill: "🧾", Debt: "💳" } as const;

type Row = {
  id: string;
  kind: "Bill" | "Debt";
  name: string;
  amount: number;
  due_date: string | null;
  category_id: string | null;
  cycle: string | null;
  payable: Payable;
  state: LedgerState;
  info: CycleInfo;
  inPeriod: boolean;
  inMonth: boolean;
  bill?: Bill;
  debt?: Debt;
};

const STATE_LABEL: Record<LedgerState, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  partial: "Partial",
  cleared: "Cleared",
};

function EverythingPage() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: categories = [] } = useCategories();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: incomeEvents = [] } = useIncomeEvents();
  const resetDebts = useResetDebtsMonth();
  const { tap, busy, picker } = usePayFlow();
  const infoOf = useCycleState();

  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "bills" | "debts">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | LedgerState>("all");
  const [dueFilter, setDueFilter] = useState<"any" | "period" | "month">("any");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<"due" | "amount" | "alpha">("due");
  const [group, setGroup] = useState<"none" | "category" | "kind" | "status" | "period" | "month">(
    "none",
  );

  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [debtDetail, setDebtDetail] = useState<Debt | null>(null);
  const [editingBill, setEditingBill] = useState<Partial<Bill> | null>(null);
  const [editingDebt, setEditingDebt] = useState<Partial<Debt> | null>(null);

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  const today = todayISO();
  const period = useMemo(
    () => currentPayPeriod(incomeSources, incomeEvents as never, today),
    [incomeSources, incomeEvents, today],
  );
  const month = useMemo(() => currentMonthWindow(today), [today]);

  const rows = useMemo<Row[]>(() => {
    const build = (
      base: Omit<Row, "inPeriod" | "inMonth" | "state" | "info">,
      info: CycleInfo,
    ): Row => ({
      ...base,
      state: info.state,
      info,
      inPeriod: period ? dueInPeriod(base.due_date, period, today) : false,
      inMonth: dueInPeriod(base.due_date, month, today),
    });

    const all: Row[] = [
      ...bills.map((b) => {
        const payable = toPayable("bill", b);
        return build(
          {
            id: b.id,
            kind: "Bill" as const,
            name: b.name,
            amount: Number(b.amount || 0),
            due_date: b.next_due_date ? b.next_due_date.slice(0, 10) : null,
            category_id: b.category_id,
            cycle: b.billing_cycle,
            payable,
            bill: b,
          } as Omit<Row, "inPeriod" | "inMonth" | "state" | "info">,
          infoOf(payable),
        );
      }),
      ...debts.map((d) => {
        const payable = toPayable("debt", d);
        return build(
          {
            id: d.id,
            kind: "Debt" as const,
            name: d.name,
            amount: Number(d.minimum_payment || 0),
            due_date: debtDueDate(d),
            category_id: d.category_id,
            cycle: d.billing_cycle ?? "monthly",
            payable,
            debt: d,
          } as Omit<Row, "inPeriod" | "inMonth" | "state" | "info">,
          infoOf(payable),
        );
      }),
    ];

    let out = all;
    if (kindFilter === "bills") out = out.filter((r) => r.kind === "Bill");
    if (kindFilter === "debts") out = out.filter((r) => r.kind === "Debt");
    if (statusFilter !== "all") out = out.filter((r) => r.state === statusFilter);
    if (dueFilter === "period") out = out.filter((r) => r.inPeriod);
    if (dueFilter === "month") out = out.filter((r) => r.inMonth);
    if (selectedCategories.length > 0) {
      out = out.filter((r) =>
        r.category_id
          ? selectedCategories.includes(r.category_id)
          : selectedCategories.includes("none"),
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(t));
    }
    out = [...out].sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "alpha") return a.name.localeCompare(b.name);
      return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
    });
    return out;
  }, [
    bills,
    debts,
    kindFilter,
    statusFilter,
    dueFilter,
    selectedCategories,
    q,
    sort,
    infoOf,
    period,
    month,
    today,
  ]);

  const groups = useMemo<Array<[string, Row[]]>>(() => {
    if (group === "none") return [["", rows]];
    if (group === "category")
      return groupRows(rows, (r) =>
        r.category_id ? (categoryName[r.category_id] ?? "Uncategorized") : "Uncategorized",
      );
    if (group === "kind") return groupRows(rows, (r) => (r.kind === "Bill" ? "Bills" : "Debts"));
    if (group === "status") return groupRows(rows, (r) => STATE_LABEL[r.state]);
    if (group === "period")
      return groupRows(rows, (r) => (r.inPeriod ? "Due this pay period" : "Later"));
    return groupRows(rows, (r) => (r.inMonth ? "Due this month" : "Later"));
  }, [rows, group, categoryName]);

  async function handleResetDebts() {
    if (!confirm("Reset all debt payments to unpaid for the new month?")) return;
    try {
      await resetDebts.mutateAsync();
      toast.success("Debts reset for the new month");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** ADR-036: the shared ledger-derived state machine drives every tap. */
  function handleTap(r: Row) {
    tap(r.payable, r.info);
  }

  function openDetail(r: Row) {
    if (r.bill) setBillDetail(r.bill);
    else if (r.debt) setDebtDetail(r.debt);
  }

  return (
    <>
      <AppHeader title="Everything" />
      <div className="space-y-3 p-4">
        <ListControls
          query={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={(v) => setSort(v as typeof sort)}
          sortOptions={[
            { value: "due", label: "Due date" },
            { value: "amount", label: "Amount" },
            { value: "alpha", label: "A–Z" },
          ]}
          group={group}
          onGroupChange={(v) => setGroup(v as typeof group)}
          groupOptions={[
            { value: "category", label: "Category" },
            { value: "kind", label: "Bill / Debt" },
            { value: "status", label: "Paid status" },
            { value: "period", label: "Due this pay period" },
            { value: "month", label: "Due this month" },
          ]}
          categories={categories}
          selectedCategories={selectedCategories}
          onSelectedCategoriesChange={setSelectedCategories}
        />

        <div className="grid grid-cols-3 gap-2">
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as typeof kindFilter)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="bills">Bills only</SelectItem>
              <SelectItem value="debts">Debts only</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as typeof dueFilter)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any due date</SelectItem>
              <SelectItem value="period" disabled={!period}>
                Due this pay period
              </SelectItem>
              <SelectItem value="month">Due this month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          onClick={handleResetDebts}
          className="h-11 w-full"
          disabled={resetDebts.isPending}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset debts for new month
        </Button>

        <div className="space-y-4 pt-2">
          {rows.length === 0 && (
            <Card>
              <CardContent className="p-0">
                <EmptyState>Nothing matches.</EmptyState>
              </CardContent>
            </Card>
          )}
          {groups.map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label || "all"} className="space-y-2">
                {label ? (
                  <div className="flex items-baseline justify-between gap-2">
                    <SectionLabel>{label}</SectionLabel>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {list.length} · {formatMoney(list.reduce((s, r) => s + r.amount, 0))}
                    </span>
                  </div>
                ) : null}
                {list.map((r) => {
                  const paid = r.state === "cleared";
                  const { Icon, className: stateColor } = stateVisual(r.state);
                  return (
                    <Card key={`${r.kind}-${r.id}`}>
                      <CardContent className="flex items-center gap-3 p-3">
                        <button
                          type="button"
                          aria-label={`${r.name}: ${r.state} — tap to advance`}
                          disabled={busy}
                          onClick={() => handleTap(r)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border disabled:opacity-50"
                        >
                          <Icon className={`h-6 w-6 ${stateColor}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetail(r)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span aria-label={r.kind} title={r.kind} className="shrink-0">
                              {KIND_EMOJI[r.kind]}
                            </span>
                            {r.due_date ? (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {r.due_date.slice(5)}
                              </span>
                            ) : null}
                            <p
                              className={`truncate font-medium ${paid ? "line-through text-muted-foreground" : ""}`}
                            >
                              {r.name}
                            </p>
                            <StatusBadge status={r.state} />
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="w-24 shrink-0 justify-center truncate text-[11px] font-normal"
                            >
                              {r.cycle ?? "—"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="w-32 shrink-0 justify-center truncate text-[11px] font-normal"
                            >
                              {r.category_id
                                ? (categoryName[r.category_id] ?? "Uncategorized")
                                : "Uncategorized"}
                            </Badge>
                          </div>
                          {r.info.clearedSum > 0 && r.info.remaining > 0 ? (
                            <p className="mt-1 text-xs font-medium text-destructive">
                              {formatMoney(r.info.remaining)} still owed this cycle
                            </p>
                          ) : null}
                        </button>
                        <p className="shrink-0 font-semibold tabular-nums">
                          {formatMoney(r.amount)}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ),
          )}
        </div>
      </div>
      {picker}
      <BillDetailDialog
        bill={billDetail}
        onClose={() => setBillDetail(null)}
        onEdit={(b) => {
          setBillDetail(null);
          setEditingBill(b);
        }}
      />
      <BillDialog bill={editingBill} onClose={() => setEditingBill(null)} />
      <DebtDetailDialog
        debt={debtDetail}
        onClose={() => setDebtDetail(null)}
        onEdit={(d) => {
          setDebtDetail(null);
          setEditingDebt(d);
        }}
      />
      <DebtDialog debt={editingDebt} onClose={() => setEditingDebt(null)} />
    </>
  );
}
