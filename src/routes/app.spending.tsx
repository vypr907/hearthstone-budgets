import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import {
  monthKey,
  shiftMonth,
  useCategories,
  useSpendingActuals,
  useSpendingBudgets,
  useStartNewSpendingMonth,
  useUpsertSpendingActual,
  useUpsertSpendingBudget,
} from "@/lib/data-hooks";
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
import { CalendarPlus } from "lucide-react";

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
  avg3: number;
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

  const [editing, setEditing] = useState<
    { row: Row; field: "budgeted" | "actual"; value: string } | null
  >(null);

  const categoryById = useMemo(() => {
    const m: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const groups = useMemo(() => {
    const last3 = [0, 1, 2].map((n) => shiftMonth(activeMonth, -n));

    const rows: Row[] = budgets
      .filter((b) => !!b.category_id)
      .map((b) => {
        const catId = b.category_id!;
        const mine = actuals.filter((a) => a.category_id === catId);
        const current = mine.find((a) => a.month?.slice(0, 10) === activeMonth);
        const window = last3
          .map((m) => mine.find((a) => a.month?.slice(0, 10) === m))
          .filter(Boolean);
        const avg3 = window.length
          ? window.reduce((s, a) => s + Number(a!.actual_amount || 0), 0) /
            window.length
          : 0;
        return {
          categoryId: catId,
          name: categoryById[catId]?.name ?? "Uncategorized",
          budgetId: b.id,
          budgeted: Number(b.budgeted_amount || 0),
          actualId: current?.id,
          actual: Number(current?.actual_amount || 0),
          avg3,
        };
      });

    const byParent = new Map<string, { name: string; rows: Row[] }>();
    for (const r of rows) {
      const parentId = categoryById[r.categoryId]?.parent_category ?? null;
      const key = parentId ?? "__none__";
      const name = parentId
        ? (categoryById[parentId]?.name ?? "Other")
        : "Ungrouped";
      if (!byParent.has(key)) byParent.set(key, { name, rows: [] });
      byParent.get(key)!.rows.push(r);
    }
    for (const g of byParent.values())
      g.rows.sort((a, b) => a.name.localeCompare(b.name));

    return [...byParent.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, actuals, categoryById, activeMonth]);

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
                      <span className="truncate">{r.name}</span>
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
