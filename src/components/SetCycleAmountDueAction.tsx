import { useState } from "react";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { billCycleDue, useSetBillCycleAmountDue } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import type { Bill } from "@/lib/supabase";

/**
 * ADR-058 addendum: pre-set (or correct) a variable bill's amount for the
 * current cycle without waiting to pay it, and without a synthetic
 * bill_adjustments entry. Only meaningful for variable-amount bills — a
 * fixed bill's due amount always comes from `bills.amount`.
 */
export function SetCycleAmountDueAction({ bill }: { bill: Bill }) {
  const set = useSetBillCycleAmountDue();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");

  if (!bill.is_variable_amount) return null;

  const current = billCycleDue(bill);

  function start() {
    setAmount(bill.cycle_amount_due != null ? String(current) : "");
    setOpen(true);
  }

  async function save() {
    const value = Math.abs(Number(amount)) || 0;
    if (!value) {
      toast.error("Enter an amount");
      return;
    }
    try {
      await set.mutateAsync({ bill, amount: value });
      toast.success(`This cycle's amount set to ${formatMoney(value)}`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-12 w-full justify-start gap-2"
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
      >
        <PencilLine className="h-5 w-5" />
        <span>Set amount owed this cycle</span>
        <span className="ml-auto text-xs opacity-80">
          {bill.cycle_amount_due != null ? formatMoney(current) : "not set yet"}
        </span>
      </Button>

      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Amount owed this cycle · {bill.name}</DialogTitle>
              <DialogDescription>
                Set this ahead of paying — useful once a statement posts a known total
                before the due date. Doesn't record a payment or an adjustment; just the
                target this cycle's Submit/Clear and "still owed" figures compare against.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="cycle-amount-due">Amount</Label>
              <Input
                id="cycle-amount-due"
                type="number"
                step="0.01"
                inputMode="decimal"
                className="h-11"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="h-11" disabled={set.isPending} onClick={save}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
