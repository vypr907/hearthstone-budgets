import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useBills,
  useDebts,
  useSetPaymentStatus,
  useResetMonth,
} from "@/lib/data-hooks";
import { formatMoney, dueDayFromDate } from "@/lib/format";
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

export const Route = createFileRoute("/app/everything")({
  component: EverythingPage,
});

type Row = {
  id: string;
  kind: "Bill" | "Debt";
  name: string;
  amount: number;
  due_day: number | null;
  payment_status: string | null;
};

function isPaid(status: string | null | undefined) {
  return status === "paid" || status === "cleared";
}

function EverythingPage() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const setStatus = useSetPaymentStatus();
  const resetMonth = useResetMonth();

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "bills" | "debts" | "unpaid" | "paid">(
    "all",
  );
  const [sort, setSort] = useState<"due" | "amount" | "name">("due");

  const rows = useMemo<Row[]>(() => {
    const all: Row[] = [
      ...bills.map((b) => ({
        id: b.id,
        kind: "Bill" as const,
        name: b.name,
        amount: Number(b.amount || 0),
        due_day: dueDayFromDate(b.next_due_date),
        payment_status: b.payment_status,
      })),
      ...debts.map((d) => ({
        id: d.id,
        kind: "Debt" as const,
        name: d.name,
        amount: Number(d.minimum_payment || 0),
        due_day: d.due_day,
        payment_status: d.payment_status,
      })),
    ];

    let out = all;
    if (filter === "bills") out = out.filter((r) => r.kind === "Bill");
    if (filter === "debts") out = out.filter((r) => r.kind === "Debt");
    if (filter === "unpaid") out = out.filter((r) => !isPaid(r.payment_status));
    if (filter === "paid") out = out.filter((r) => isPaid(r.payment_status));
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((r) => r.name.toLowerCase().includes(t));
    }
    out = [...out].sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "name") return a.name.localeCompare(b.name);
      return (a.due_day ?? 99) - (b.due_day ?? 99);
    });
    return out;
  }, [bills, debts, filter, q, sort]);

  async function handleReset() {
    if (!confirm("Reset all bills and debts to unpaid for the new month?")) return;
    try {
      await resetMonth.mutateAsync();
      toast.success("Reset for new month");
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
              <SelectItem value="due">Sort: Due day</SelectItem>
              <SelectItem value="amount">Sort: Amount</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          onClick={handleReset}
          className="h-11 w-full"
          disabled={resetMonth.isPending}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset for new month
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
                    onCheckedChange={(c) =>
                      setStatus.mutate({
                        kind: r.kind === "Bill" ? "bill" : "debt",
                        id: r.id,
                        status: c ? "paid" : "unpaid",
                      })
                    }
                    className="h-6 w-6"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-medium ${paid ? "line-through text-muted-foreground" : ""}`}
                    >
                      {r.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.kind}
                      {r.due_day ? ` · day ${r.due_day}` : ""}
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
