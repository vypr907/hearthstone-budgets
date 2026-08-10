import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { useUpsertBill, useUpsertDebt } from "@/lib/data-hooks";
import { computeArrears } from "@/lib/arrears";
import { toPayable } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import type { Bill, Debt } from "@/lib/supabase";

/**
 * ADR-051: past-due money is part computed (missed cycles) and part manual
 * (what was already behind before this app tracked the item). Only the manual
 * part is editable here — the computed part keeps updating on its own.
 */
export function PastDueEditor({ bill, debt }: { bill?: Bill; debt?: Debt }) {
  const row = bill ?? debt;
  const saveBill = useUpsertBill();
  const saveDebt = useUpsertDebt();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState("");
  const [asOf, setAsOf] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    setOpening(row.opening_arrears != null ? String(row.opening_arrears) : "");
    setAsOf(row.arrears_as_of ? row.arrears_as_of.slice(0, 10) : "");
  }, [open, row]);

  if (!row) return null;

  const payable = bill ? toPayable("bill", bill) : toPayable("debt", debt!);
  const arrears = computeArrears(payable);
  const missed = Math.max(0, arrears.amountOverdue - arrears.openingArrears);

  async function save() {
    const value = opening ? Number(opening) : 0;
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a past-due amount of zero or more");
      return;
    }
    try {
      if (bill) {
        await saveBill.mutateAsync({
          id: bill.id,
          name: bill.name,
          amount: Number(bill.amount ?? 0),
          opening_arrears: value,
          arrears_as_of: value && asOf ? asOf : null,
        });
      } else {
        await saveDebt.mutateAsync({
          id: debt!.id,
          name: debt!.name,
          opening_arrears: value,
          arrears_as_of: value && asOf ? asOf : null,
        });
      }
      toast.success("Past due updated");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button variant="outline" className="h-11 w-full" onClick={() => setOpen(true)}>
        Edit past due
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Past due — {row.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-[14px] bg-muted/50 p-3 text-sm">
              <Line label="Carried in" value={arrears.openingArrears} />
              <Line
                label={`Missed cycles${arrears.cyclesMissed ? ` (${arrears.cyclesMissed})` : ""}`}
                value={missed}
              />
              <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Total past due</span>
                <span>{formatMoney(arrears.amountOverdue)}</span>
              </div>
              {arrears.oldestMissedDate ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Oldest missed due date: {arrears.oldestMissedDate}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pd-opening">Opening arrears</Label>
              <Input
                id="pd-opening"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="h-12"
                placeholder="0.00"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                What was already past due before this app started tracking it.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pd-asof">As of date</Label>
              <Input
                id="pd-asof"
                type="date"
                className="h-12"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Due dates on or before this date are already inside the figure above,
                so they are not counted again.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="h-12 w-full"
              disabled={saveBill.isPending || saveDebt.isPending}
              onClick={() => void save()}
            >
              Save past due
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}
