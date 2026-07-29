import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useBills,
  useDebts,
  useCategories,
  useSetPaymentStatus,
  useClearBill,
  useResetDebtsMonth,
} from "@/lib/data-hooks";
import { formatMoney, dueDayToDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useMemo } from "react";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import type { Bill } from "@/lib/supabase";

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

type Row = {
  id: string;
  kind: "Bill" | "Debt";
  name: string;
  amount: number;
  due_date: string | null;
  category_id: string | null;
  cycle: string | null;
  payment_status: string | null;
  bill?: Bill;
};

function isPaid(status: string | null | undefined) {
  return status === "paid" || status === "cleared";
}

function EverythingPage() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: categories = [] } = useCategories();
  const setStatus = useSetPaymentStatus();
  const clearBill = useClearBill();
  const resetDebts = useResetDebtsMonth();

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "bills" | "debts" | "unpaid" | "paid">(
    "all",
  );
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"due" | "amount">("due");

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...bills.map((b) => ({
        id: b.id,
        kind: "Bill" as const,
        name: b.name,
        amount: Number(b.amount || 0),
        due_date: b.next_due_date ? b.next_due_date.slice(0, 10) : null,
        category_id: b.category_id,
        cycle: b.billing_cycle,
        payment_status: b.payment_status,
        bill: b,
      })),
      ...debts.map((d) => ({
        id: d.id,
        kind: "Debt" as const,
        name: d.name,
        amount: Number(d.minimum_payment || 0),
        due_date: dueDayToDate(d.due_day),
        category_id: d.category_id,
        cycle: "monthly",
        payment_status: d.payment_status,
      })),
    ];

    let out = all;
    if (filter === "bills") out = out.filter((r) => r.kind === "Bill");
    if (filter === "debts") out = out.filter((r) => r.kind === "Debt");
    if (filter === "unpaid") out = out.filter((r) => !isPaid(r.payment_status));
    if (filter === "paid") out = out.filter((r) => isPaid(r.payment_status));
    if (category !== "all") {
      out =
        category === "none"
          ? out.filter((r) => !r.category_id)
          : out.filter((r) => r.category_id === category);
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(t));
    }
    out = [...out].sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
    });
    return out;
  }, [bills, debts, filter, category, q, sort]);

  async function handleResetDebts() {
    if (!confirm("Reset all debt payments to unpaid for the new month?")) return;
    try {
      await resetDebts.mutateAsync();
      toast.success("Debts reset for the new month");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleCheck(r: Row, checked: boolean) {
    try {
      if (r.kind === "Bill" && r.bill) {
        if (!checked) {
          await setStatus.mutateAsync({ kind: "bill", id: r.id, status: "unpaid" });
          return;
        }
        const next = await clearBill.mutateAsync(r.bill);
        toast.success(`${r.name} cleared · next due ${next}`);
        return;
      }
      await setStatus.mutateAsync({
        kind: "debt",
        id: r.id,
        status: checked ? "cleared" : "unpaid",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Everything" />
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="bills">Bills only</SelectItem>
              <SelectItem value="debts">Debts only</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Sort: Due date</SelectItem>
              <SelectItem value="amount">Sort: Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={handleResetDebts}
          className="h-11 w-full"
          disabled={resetDebts.isPending}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset debts for new month
        </Button>

        <div className="space-y-2 pt-2">
          {rows.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nothing matches.
              </CardContent>
            </Card>
          )}
          {rows.map((r) => {
            const paid = isPaid(r.payment_status);
            return (
              <Card key={`${r.kind}-${r.id}`}>
                <CardContent className="flex items-center gap-3 p-3">
                  <Checkbox
                    checked={paid}
                    onCheckedChange={(c) => handleCheck(r, !!c)}
                    className="h-6 w-6"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-medium ${paid ? "line-through text-muted-foreground" : ""}`}
                    >
                      {r.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.kind}
                      {r.due_date ? ` · due ${r.due_date}` : ""}
                      {r.cycle ? ` · ${r.cycle}` : ""}
                      {r.category_id && categoryName[r.category_id]
                        ? ` · ${categoryName[r.category_id]}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{formatMoney(r.amount)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
