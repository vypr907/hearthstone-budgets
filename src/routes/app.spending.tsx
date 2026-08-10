import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import {
  monthKey,
  shiftMonth,
  useCategories,
  useClearSpendingOverride,
  useCreateCategory,
  useSpendingActuals,
  useSpendingBudgets,
  useStartNewSpendingMonth,
  useBills,
  useTransactions,
  useUpsertSpendingActual,
  useUpsertSpendingBudget,
} from "@/lib/data-hooks";
import { billsBudgetedByCategory, buildActualResolver } from "@/lib/spending-actuals";
import { formatMoney } from "@/lib/format";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarPlus, ChevronLeft, ChevronRight, HelpCircle, PencilLine, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ItemBar, ProgressRing, itemColor } from "@/components/viz";
import { categoryVisual } from "@/lib/visual-meta";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/app/spending")({
  head: () => ({
    meta: [
      { title: "Spending — Hearthstone" },
      {
        name: "description",
        content:
          "Track household budget items by parent category with budgeted, current-month and 3-month average spend.",
      },
      { property: "og:title", content: "Spending — Hearthstone" },
      {
        property: "og:description",
        content:
          "Track household budget items by parent category with budgeted, current-month and 3-month average spend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingPage,
});

type Row = {
  categoryId: string;
  name: string;
  budgetId?: string;
  budgeted: number;
  billsBudgeted: number;
  actualId?: string;
  actual: number;
  billsSpent: number;
  spendingSpent: number;
  actualSource: "ledger" | "manual" | "override";
  hasLedger: boolean;
  avg3: number;
  description?: string | null;
  icon: string;
  color: string;
};


function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function SpendingPage() {
  const { data: categories = [] } = useCategories();
  const { data: budgets = [], isLoading } = useSpendingBudgets();
  const { data: actuals = [] } = useSpendingActuals();
  const { data: transactions = [] } = useTransactions();
  const { data: bills = [] } = useBills();

  const saveBudget = useUpsertSpendingBudget();
  const saveActual = useUpsertSpendingActual();
  const clearOverride = useClearSpendingOverride();
  const startMonth = useStartNewSpendingMonth();

  // The ledger month is the newest month present in the actuals ledger,
  // never earlier than the real calendar month.
  const latestMonth = actuals[0]?.month?.slice(0, 10);
  const thisMonth = monthKey();
  const ledgerMonth =
    latestMonth && latestMonth > thisMonth ? latestMonth : thisMonth;

  // Month navigator (defaults to the current calendar month).
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const activeMonth = selectedMonth ?? thisMonth;


  const createCategory = useCreateCategory();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    mode: "existing" as "existing" | "new",
    categoryId: "",
    newName: "",
    newParent: "",
    amount: "",
    description: "",
  });

  const [editing, setEditing] = useState<
    { row: Row; field: "budgeted" | "actual"; value: string } | null
  >(null);
  const [confirming, setConfirming] = useState(false);

  const categoryById = useMemo(() => {
    const m: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const resolver = useMemo(
    () => buildActualResolver(actuals, transactions, bills),
    [actuals, transactions, bills],
  );

  const billsBudget = useMemo(() => billsBudgetedByCategory(bills), [bills]);

  const groups = useMemo(() => {
    const last3 = [0, 1, 2].map((n) => shiftMonth(activeMonth, -n));

    const rows: Row[] = budgets
      .filter((b) => !!b.category_id)
      .map((b) => {
        const catId = b.category_id!;
        const current = resolver.resolve(catId, activeMonth);
        const window = last3.filter((m) => resolver.has(catId, m));
        const avg3 = window.length
          ? window.reduce((s, m) => s + resolver.resolve(catId, m).amount, 0) /
            window.length
          : 0;
        return {
          categoryId: catId,
          name: categoryById[catId]?.name ?? "Uncategorized",
          budgetId: b.id,
          budgeted: Number(b.budgeted_amount || 0),
          billsBudgeted: billsBudget.get(catId) ?? 0,
          actualId: current.rowId,
          actual: current.amount,
          billsSpent: current.billsSpent,
          spendingSpent: current.spendingSpent,
          actualSource: current.source,
          hasLedger: !!current.hasLedger,
          avg3,
          description: b.description ?? null,
          ...categoryVisual(categoryById[catId]),
        };
      });

    const byParent = new Map<string, { name: string; rows: Row[] }>();
    for (const r of rows) {
      const parent = categoryById[r.categoryId]?.parent_category?.trim() || "";
      const key = parent || "__none__";
      const name = parent || "Ungrouped";
      if (!byParent.has(key)) byParent.set(key, { name, rows: [] });
      byParent.get(key)!.rows.push(r);
    }
    for (const g of byParent.values())
      g.rows.sort((a, b) => a.name.localeCompare(b.name));

    return [...byParent.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, resolver, categoryById, activeMonth, billsBudget]);


  const totals = useMemo(() => {
    const all = groups.flatMap((g) => g.rows);
    return {
      budgeted: all.reduce((s, r) => s + r.budgeted + r.billsBudgeted, 0),
      spendingBudgeted: all.reduce((s, r) => s + r.budgeted, 0),
      billsBudgeted: all.reduce((s, r) => s + r.billsBudgeted, 0),
      actual: all.reduce((s, r) => s + r.actual, 0),
      billsSpent: all.reduce((s, r) => s + r.billsSpent, 0),
      spendingSpent: all.reduce((s, r) => s + r.spendingSpent, 0),
      avg3: all.reduce((s, r) => s + r.avg3, 0),
    };
  }, [groups]);

  async function submitEdit(force = false) {
    if (!editing) return;
    const amount = Number(editing.value);
    if (!Number.isFinite(amount)) {
      toast.error("Enter a number");
      return;
    }
    // ADR-041: warn once before a manual total starts overriding logged spend.
    if (
      !force &&
      editing.field === "actual" &&
      editing.row.actualSource === "ledger" &&
      editing.row.hasLedger
    ) {
      setConfirming(true);
      return;
    }
    try {
      if (editing.field === "budgeted") {
        await saveBudget.mutateAsync({
          id: editing.row.budgetId,
          categoryId: editing.row.categoryId,
          amount,
        });
      } else {
        await saveActual.mutateAsync({
          id: editing.row.actualId,
          categoryId: editing.row.categoryId,
          month: activeMonth,
          amount,
          manualOverride: true,
        });
      }
      toast.success(`${editing.row.name} updated`);
      setConfirming(false);
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submitNewItem() {
    const amount = Number(form.amount || 0);
    if (!Number.isFinite(amount)) {
      toast.error("Enter a number for the budgeted amount");
      return;
    }
    try {
      let categoryId = form.categoryId;
      if (form.mode === "new") {
        if (!form.newName.trim()) {
          toast.error("Enter a category name");
          return;
        }
        const cat = await createCategory.mutateAsync({
          name: form.newName.trim(),
          parentCategory: form.newParent.trim() || null,
        });
        categoryId = cat.id;
      }
      if (!categoryId) {
        toast.error("Pick a category");
        return;
      }
      await saveBudget.mutateAsync({
        categoryId,
        amount,
        description: form.description.trim() || null,
      });
      toast.success("Budget item added");
      setAdding(false);
      setForm({
        mode: "existing",
        categoryId: "",
        newName: "",
        newParent: "",
        amount: "",
        description: "",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleStartNewMonth() {
    const next = shiftMonth(ledgerMonth, 1);
    try {
      await startMonth.mutateAsync({
        nextMonth: next,
        categoryIds: groups.flatMap((g) => g.rows.map((r) => r.categoryId)),
      });
      setSelectedMonth(next);
      toast.success(`${monthLabel(ledgerMonth)} locked in · now on ${monthLabel(next)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Spending" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            aria-label="Previous month"
            onClick={() => setSelectedMonth(shiftMonth(activeMonth, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <button
            className="flex-1 text-center"
            onClick={() => setSelectedMonth(thisMonth)}
            aria-label="Jump to current month"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {activeMonth === thisMonth ? "Active month" : "Viewing"}
            </p>
            <p className="text-base font-semibold">{monthLabel(activeMonth)}</p>
          </button>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0"
            aria-label="Next month"
            onClick={() => setSelectedMonth(shiftMonth(activeMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <Button
          variant="outline"
          className="h-12 w-full"
          disabled={startMonth.isPending || groups.length === 0}
          onClick={handleStartNewMonth}
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          Start new month ({monthLabel(shiftMonth(ledgerMonth, 1))})
        </Button>


        <Button className="h-12 w-full" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New budget item
        </Button>

        {groups.length > 0 ? <SpendingSummary totals={totals} /> : null}

        {/* ADR-053: the merchant-level view of the same money. */}
        <Link to="/app/spending-by-place" className="block">
          <Button variant="outline" className="h-11 w-full">
            See spending by place
          </Button>
        </Link>


        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No budget items yet. Add spending budgets for your categories to see them
            here.
          </p>
        ) : (
          groups.map((g) => {
            const sub = {
              budgeted: g.rows.reduce((s, r) => s + r.budgeted + r.billsBudgeted, 0),
              spendingBudgeted: g.rows.reduce((s, r) => s + r.budgeted, 0),
              billsBudgeted: g.rows.reduce((s, r) => s + r.billsBudgeted, 0),
              actual: g.rows.reduce((s, r) => s + r.actual, 0),
              billsSpent: g.rows.reduce((s, r) => s + r.billsSpent, 0),
              spendingSpent: g.rows.reduce((s, r) => s + r.spendingSpent, 0),
              avg3: g.rows.reduce((s, r) => s + r.avg3, 0),
            };
            return (
              <Card key={g.name}>
                <CardContent className="p-2">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {g.name}
                  </p>
                  {g.rows.map((r, i) => (
                    <SpendingRow
                      key={r.categoryId}
                      row={r}
                      index={i}
                      onEdit={(field) =>
                        setEditing({
                          row: r,
                          field,
                          value: String(field === "budgeted" ? r.budgeted : r.actual),
                        })
                      }
                      onClearOverride={() =>
                        r.actualId &&
                        clearOverride
                          .mutateAsync({ id: r.actualId })
                          .then(() => toast.success(`${r.name} back on transactions`))
                          .catch((e: unknown) => toast.error((e as Error).message))
                      }
                    />
                  ))}
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2 py-2 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Subtotal
                    </span>
                    <span className="tabular-nums">
                      <span className="font-bold">{formatMoney(sub.actual)}</span>
                      <span className="text-muted-foreground">
                        {" "}of {formatMoney(sub.budgeted)}
                      </span>
                    </span>
                  </div>
                </CardContent>

              </Card>
            );
          })
        )}

        {null}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New budget item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={form.mode === "existing" ? "default" : "outline"}
                className="h-11"
                onClick={() => setForm((f) => ({ ...f, mode: "existing" }))}
              >
                Existing category
              </Button>
              <Button
                variant={form.mode === "new" ? "default" : "outline"}
                className="h-11"
                onClick={() => setForm((f) => ({ ...f, mode: "new" }))}
              >
                New category
              </Button>
            </div>

            {form.mode === "existing" ? (
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Pick a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.parent_category ? ` · ${c.parent_category}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-name">Category name</Label>
                  <Input
                    id="new-name"
                    className="h-12"
                    value={form.newName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, newName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-parent">Parent category</Label>
                  <Input
                    id="new-parent"
                    className="h-12"
                    placeholder="e.g. Puff"
                    value={form.newParent}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, newParent: e.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-amount">Budgeted amount</Label>
              <Input
                id="new-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="h-12"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-desc">Description (optional)</Label>
              <Textarea
                id="new-desc"
                rows={2}
                placeholder="Short note explaining this line"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-12 w-full"
              disabled={saveBudget.isPending || createCategory.isPending}
              onClick={submitNewItem}
            >
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.field === "budgeted" ? "Budgeted amount" : "Actual spend"} ·{" "}
              {editing?.row.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="amount">
              {editing?.field === "actual"
                ? `Amount for ${monthLabel(activeMonth)}`
                : "Amount"}
            </Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              className="h-12"
              value={editing?.value ?? ""}
              onChange={(e) =>
                setEditing((s) => (s ? { ...s, value: e.target.value } : s))
              }
            />
          </div>
          <DialogFooter>
            <Button
              className="h-12 w-full"
              disabled={saveBudget.isPending || saveActual.isPending}
              onClick={() => submitEdit()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override the transaction total?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This category has logged transactions this month — manually editing will
            use your total instead of the transaction sum going forward.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              className="h-12 w-full"
              disabled={saveActual.isPending}
              onClick={() => submitEdit(true)}
            >
              Use my total
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SpendRow = {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  description?: string | null;
  budgeted: number;
  billsBudgeted: number;
  actual: number;
  spendingSpent: number;
  billsSpent: number;
  avg3: number;
  actualSource: string;
  actualId?: string;
};

/** Chart-led month summary that replaces the old table header row. */
function SpendingSummary({
  totals,
}: {
  totals: {
    budgeted: number;
    spendingBudgeted: number;
    billsBudgeted: number;
    actual: number;
    spendingSpent: number;
    billsSpent: number;
    avg3: number;
  };
}) {
  const pct =
    totals.budgeted > 0
      ? Math.min(100, (totals.actual / totals.budgeted) * 100)
      : totals.actual > 0
        ? 100
        : 0;
  const over = totals.budgeted > 0 && totals.actual > totals.budgeted;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Spent this month
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-3xl font-extrabold tabular-nums">
            {formatMoney(totals.actual)}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            of {formatMoney(totals.budgeted)}
          </p>
        </div>
        <ItemBar
          value={pct}
          color={over ? "var(--destructive)" : "var(--brand)"}
          className="mt-2"
        />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Spending", value: totals.spendingSpent },
            { label: "Bills", value: totals.billsSpent },
            { label: "3-mo avg", value: totals.avg3 },
          ].map((s) => (
            <div key={s.label} className="rounded-[12px] bg-muted/40 p-2">
              <p className="text-sm font-bold tabular-nums">{formatMoney(s.value)}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Condensed category row — numbers on tap, editing kept one level down. */
function SpendingRow({
  row: r,
  index: i,
  onEdit,
  onClearOverride,
}: {
  row: SpendRow;
  index: number;
  onEdit: (field: "budgeted" | "actual") => void;
  onClearOverride: () => void;
}) {
  const [open, setOpen] = useState(false);
  const totalBudget = r.budgeted + r.billsBudgeted;
  const pct =
    totalBudget > 0
      ? Math.min(100, (r.actual / totalBudget) * 100)
      : r.actual > 0
        ? 100
        : 0;
  const over = totalBudget > 0 && r.actual > totalBudget;
  const color = over ? "var(--destructive)" : (r.color ?? itemColor(i));
  return (
    <div className="border-l-4 px-2 py-2" style={{ borderColor: r.color }}>
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ProgressRing value={pct} color={color} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1 text-sm">
            <span aria-hidden>{r.icon}</span>
            <span className="truncate">{r.name}</span>
          </span>
          <span
            className={
              over
                ? "text-[10px] uppercase tracking-widest text-destructive"
                : "text-[10px] uppercase tracking-widest text-muted-foreground"
            }
          >
            {over
              ? `${formatMoney(r.actual - totalBudget)} over`
              : `${formatMoney(totalBudget - r.actual)} left`}
          </span>
        </span>
        <span className="shrink-0 text-right text-sm tabular-nums">
          <span className="font-bold">{formatMoney(r.actual)}</span>
          <span className="block text-[10px] text-muted-foreground">
            of {formatMoney(totalBudget)}
          </span>
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-2 pl-[3.75rem]">
          <p className="text-[10px] tabular-nums text-muted-foreground">
            Budget {formatMoney(r.budgeted)} spending + {formatMoney(r.billsBudgeted)}{" "}
            bills · Spent {formatMoney(r.spendingSpent)} spending +{" "}
            {formatMoney(r.billsSpent)} bills · 3-mo avg {formatMoney(r.avg3)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => onEdit("budgeted")}
            >
              Budget {formatMoney(r.budgeted)}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => onEdit("actual")}
            >
              Actual {formatMoney(r.actual)}
            </Button>
            {r.actualSource === "override" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                aria-label={`Use transaction total for ${r.name}`}
                onClick={onClearOverride}
              >
                <PencilLine className="mr-1 h-3.5 w-3.5" />
                Use transactions
              </Button>
            ) : null}
            {r.description ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    aria-label={`About ${r.name}`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-sm">{r.description}</PopoverContent>
              </Popover>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
