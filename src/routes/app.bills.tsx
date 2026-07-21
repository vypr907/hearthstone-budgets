import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useBills, useDeleteBill, useUpsertBill } from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Bill } from "@/lib/supabase";

export const Route = createFileRoute("/app/bills")({
  component: BillsPage,
});

function BillsPage() {
  const { data: bills = [], isLoading } = useBills();
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);

  return (
    <>
      <AppHeader title="Bills" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add bill
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && bills.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No bills yet.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {bills.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.due_day ? `Day ${b.due_day}` : "No due day"}
                    {b.payment_status ? ` · ${b.payment_status}` : ""}
                  </p>
                </div>
                <p className="shrink-0 font-semibold">{formatMoney(Number(b.amount))}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditing(b)}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <BillDialog
        bill={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function BillDialog({ bill, onClose }: { bill: Partial<Bill> | null; onClose: () => void }) {
  const upsert = useUpsertBill();
  const del = useDeleteBill();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [notes, setNotes] = useState("");

  const open = bill !== null;
  const isEdit = !!bill?.id;

  // reset on open
  useState(() => 0);
  if (open && name === "" && bill && bill.id !== undefined && (bill as Bill).name) {
    // no-op guard
  }

  // sync when bill changes
  const key = bill?.id ?? "new";
  const [lastKey, setLastKey] = useState<string>("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(bill?.name ?? "");
    setAmount(bill?.amount != null ? String(bill.amount) : "");
    setDueDay(bill?.due_day != null ? String(bill.due_day) : "");
    setNotes(bill?.notes ?? "");
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim() || !amount) {
      toast.error("Name and amount are required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: bill?.id,
        name: name.trim(),
        amount: Number(amount),
        due_day: dueDay ? Number(dueDay) : null,
        notes: notes || null,
      });
      toast.success(isEdit ? "Bill updated" : "Bill added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!bill?.id) return;
    if (!confirm("Delete this bill?")) return;
    try {
      await del.mutateAsync(bill.id);
      toast.success("Bill deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bill" : "Add bill"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-amt">Amount</Label>
              <Input
                id="b-amt"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="b-day">Due day</Label>
              <Input
                id="b-day"
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
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea id="b-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
