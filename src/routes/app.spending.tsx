import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import {
  monthKey,
  shiftMonth,
  useCategories,
  useCreateCategory,
  useSpendingActuals,
  useSpendingBudgets,
  useStartNewSpendingMonth,
  useTransactions,
  useUpsertSpendingActual,
  useUpsertSpendingBudget,
} from "@/lib/data-hooks";
import { buildActualResolver } from "@/lib/spending-actuals";
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
import { CalendarPlus, HelpCircle, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
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
  actualId?: string;
  actual: number;
  actualSource: "ledger" | "manual";
  avg3: number;
  description?: string | null;
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
  const saveBudget = useUpsertSpendingBudget();
  const saveActual = useUpsertSpendingActual();
  const startMonth = useStartNewSpendingMonth();

  // The active month is the newest month present in the ledger of actuals,
  // never earlier than the real calendar month.
  const latestMonth = actuals[0]?.month?.slice(0, 10);
  const thisMonth = monthKey();
  const activeMonth =
    latestMonth && latestMonth > thisMonth ? latestMonth : thisMonth;

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

  const categoryById = useMemo(() => {
    const m: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const resolver = useMemo(
    () => buildActualResolver(actuals, transactions),
    [actuals, transactions],
  );

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
          actualId: current.rowId,
          actual: current.amount,
          actualSource: current.source,
          avg3,
          description: b.description ?? null,
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
  }, [budgets, resolver, categoryById, activeMonth]);


  const totals = useMemo(() => {
    const all = groups.flatMap((g) => g.rows);
    return {
      budgeted: all.reduce((s, r) => s + r.budgeted, 0),
      actual: all.reduce((s, r) => s + r.actual, 0),
      avg3: all.reduce((s, r) => s + r.avg3, 0),
    };
  }, [groups]);

  async function submitEdit() {
    if (!editing) return;
    const amount = Number(editing.value);
    if (!Number.isFinite(amount)) {
      toast.error("Enter a number");
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
        });
      }
      toast.success(`${editing.row.name} updated`);
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
    const next = shiftMonth(activeMonth, 1);
    try {
      await startMonth.mutateAsync({
        nextMonth: next,
        categoryIds: groups.flatMap((g) => g.rows.map((r) => r.categoryId)),
      });
      toast.success(`${monthLabel(activeMonth)} locked in · now on ${monthLabel(next)}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Spending" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Active month
            </p>
            <p className="text-base font-semibold">{monthLabel(activeMonth)}</p>
          </div>
          <Button
            variant="outline"
            className="h-12"
            disabled={startMonth.isPending || groups.length === 0}
            onClick={handleStartNewMonth}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            Start new month
          </Button>
        </div>

        <Button className="h-12 w-full" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New budget item
        </Button>

        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>Item</span>
          <span className="w-20 text-right">Budget</span>
          <span className="w-20 text-right">Actual</span>
          <span className="w-20 text-right">3-mo avg</span>
        </div>

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
              budgeted: g.rows.reduce((s, r) => s + r.budgeted, 0),
              actual: g.rows.reduce((s, r) => s + r.actual, 0),
              avg3: g.rows.reduce((s, r) => s + r.avg3, 0),
            };
            return (
              <Card key={g.name}>
                <CardContent className="p-2">
                  <p className="px-2 py-1 text-sm font-semibold">{g.name}</p>
                  {g.rows.map((r) => (
                    <div
                      key={r.categoryId}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-t border-border/60 px-2 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate">{r.name}</span>
                        {r.description ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                aria-label={`About ${r.name}`}
                                className="shrink-0 text-muted-foreground"
                              >
                                <HelpCircle className="h-4 w-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 text-sm">
                              {r.description}
                            </PopoverContent>
                          </Popover>
                        ) : null}
                      </span>
                      <button
                        className="h-10 w-20 rounded-md text-right tabular-nums underline decoration-dotted underline-offset-4 active:bg-accent/50"
                        onClick={() =>
                          setEditing({
                            row: r,
                            field: "budgeted",
                            value: String(r.budgeted),
                          })
                        }
                      >
                        {formatMoney(r.budgeted)}
                      </button>
                      <button
                        className="h-10 w-20 rounded-md text-right tabular-nums underline decoration-dotted underline-offset-4 active:bg-accent/50"
                        onClick={() =>
                          setEditing({
                            row: r,
                            field: "actual",
                            value: String(r.actual),
                          })
                        }
                      >
                        {formatMoney(r.actual)}
                      </button>
                      <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {formatMoney(r.avg3)}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-t border-border px-2 py-2 text-sm font-medium">
                    <span>Subtotal</span>
                    <span className="w-20 text-right tabular-nums">
                      {formatMoney(sub.budgeted)}
                    </span>
                    <span className="w-20 text-right tabular-nums">
                      {formatMoney(sub.actual)}
                    </span>
                    <span className="w-20 text-right tabular-nums">
                      {formatMoney(sub.avg3)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {groups.length > 0 ? (
          <Card>
            <CardContent className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 p-4 text-sm font-semibold">
              <span>Grand total</span>
              <span className="w-20 text-right tabular-nums">
                {formatMoney(totals.budgeted)}
              </span>
              <span className="w-20 text-right tabular-nums">
                {formatMoney(totals.actual)}
              </span>
              <span className="w-20 text-right tabular-nums">
                {formatMoney(totals.avg3)}
              </span>
            </CardContent>
          </Card>
        ) : null}
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
              onClick={submitEdit}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
