import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useDebts, useDeleteDebt, useUpsertDebt } from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Debt } from "@/lib/supabase";

export const Route = createFileRoute("/app/debts")({
  component: DebtsPage,
});

function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts();
  const [editing, setEditing] = useState<Partial<Debt> | null>(null);

  return (
    <>
      <AppHeader title="Debts" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add debt
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && debts.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No debts yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {debts.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.debt_type || "Debt"}
                      {d.due_day ? ` · day ${d.due_day}` : ""}
                      {d.interest_rate != null ? ` · ${Number(d.interest_rate)}% APR` : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(d)}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="font-semibold">{formatMoney(Number(d.remaining_balance))}</p>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <p className="text-xs text-muted-foreground">Min payment</p>
                    <p className="font-semibold">{formatMoney(Number(d.minimum_payment))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <DebtDialog debt={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function DebtDialog({ debt, onClose }: { debt: Partial<Debt> | null; onClose: () => void }) {
  const upsert = useUpsertDebt();
  const del = useDeleteDebt();
  const [name, setName] = useState("");
  const [remaining, setRemaining] = useState("");
  const [rate, setRate] = useState("");
  const [minPay, setMinPay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [debtType, setDebtType] = useState("");
  const [notes, setNotes] = useState("");

  const open = debt !== null;
  const isEdit = !!debt?.id;
  const key = debt?.id ?? "new";
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(debt?.name ?? "");
    setRemaining(debt?.remaining_balance != null ? String(debt.remaining_balance) : "");
    setRate(debt?.interest_rate != null ? String(debt.interest_rate) : "");
    setMinPay(debt?.minimum_payment != null ? String(debt.minimum_payment) : "");
    setDueDay(debt?.due_day != null ? String(debt.due_day) : "");
    setDebtType(debt?.debt_type ?? "");
    setNotes(debt?.notes ?? "");
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: debt?.id,
        name: name.trim(),
        remaining_balance: remaining ? Number(remaining) : null,
        interest_rate: rate ? Number(rate) : null,
        minimum_payment: minPay ? Number(minPay) : null,
        due_day: dueDay ? Number(dueDay) : null,
        debt_type: debtType || null,
        notes: notes || null,
      });
      toast.success(isEdit ? "Debt updated" : "Debt added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!debt?.id) return;
    if (!confirm("Delete this debt?")) return;
    try {
      await del.mutateAsync(debt.id);
      toast.success("Debt deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit debt" : "Add debt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label>Type</Label>
            <Input
              placeholder="Credit card, loan…"
              value={debtType}
              onChange={(e) => setDebtType(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Remaining balance</Label>
              <Input
                type="number"
                step="0.01"
                value={remaining}
                onChange={(e) => setRemaining(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Interest rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Minimum payment</Label>
              <Input
                type="number"
                step="0.01"
                value={minPay}
                onChange={(e) => setMinPay(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Due day</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" onClick={handleDelete} className="h-11">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={upsert.isPending} className="h-11">
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
