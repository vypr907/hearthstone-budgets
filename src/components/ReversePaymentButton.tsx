import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useReversePayment, type Payable } from "@/lib/payments";
import type { Transaction } from "@/lib/supabase";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * ADR-070: undo a cleared bill/debt payment. Shown next to the delete button on
 * Bill/Debt detail's "Recent transactions" rows. The payable is rolled back
 * first (ADR-037) and an offsetting cleared transaction is written after.
 */
export function ReversePaymentButton({
  transaction,
  payable,
}: {
  transaction: Transaction;
  payable: Payable;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const reverse = useReversePayment();

  const eligible =
    transaction.status === "cleared" &&
    Number(transaction.amount ?? 0) < 0 &&
    Boolean(transaction.linked_bill_id || transaction.linked_debt_id);
  if (!eligible) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-9 w-9 shrink-0"
        aria-label="Reverse payment"
        onClick={(e) => {
          e.stopPropagation();
          setDate(todayISO());
          setOpen(true);
        }}
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Reverse this payment?</DialogTitle>
            <DialogDescription>This will undo it as if it never cleared.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="reversal-date">Reversal date</Label>
            <Input
              id="reversal-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={reverse.isPending}
              onClick={() =>
                reverse.mutate(
                  { transaction, payable, date },
                  {
                    onSuccess: () => {
                      toast.success("Payment reversed");
                      setOpen(false);
                    },
                    onError: (e: unknown) => toast.error((e as Error).message),
                  },
                )
              }
            >
              Reverse payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
