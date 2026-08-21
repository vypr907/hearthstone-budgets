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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAccounts, useInstitutions } from "@/lib/data-hooks";
import {
  useCorrectPayment,
  billCycleDue,
  debtCycleDue,
  type Payable,
} from "@/lib/payments";
import { accountLabel } from "@/lib/format";
import type { Transaction } from "@/lib/supabase";

/**
 * ADR-077: fix a wrong amount/date/account on an already-cleared, linked
 * PARTIAL payment in place, shown next to Reverse/Delete on Bill/Debt detail's
 * "Recent transactions" rows. Hidden for anything the mutation can't safely
 * handle (already resolved a cycle, or the cycle it belongs to is already
 * fully paid) — those go through Reverse + redo instead.
 */
export function CorrectPaymentButton({
  transaction,
  payable,
}: {
  transaction: Transaction;
  payable: Payable;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: institutions = [] } = useInstitutions();
  const correct = useCorrectPayment();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");

  const row = payable.kind === "bill" ? payable.bill : payable.debt;
  const due = payable.kind === "bill" ? billCycleDue(payable.bill!) : debtCycleDue(payable.debt!);
  const paidToDate = Number(row?.cycle_paid_to_date ?? 0);
  const eligible =
    transaction.status === "cleared" &&
    Number(transaction.amount ?? 0) < 0 &&
    Boolean(transaction.linked_bill_id || transaction.linked_debt_id) &&
    !transaction.resolved_cycle_due_date &&
    paidToDate + 0.005 < due;
  if (!eligible) return null;

  function openDialog() {
    setAmount(String(Math.abs(Number(transaction.amount ?? 0))));
    setDate(transaction.transaction_date.slice(0, 10));
    setAccountId(transaction.account_id ?? "");
    setOpen(true);
  }

  async function submit() {
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    try {
      await correct.mutateAsync({ transaction, payable, amount: value, date, accountId });
      toast.success("Payment corrected");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="ml-1 h-9 w-9 shrink-0"
        aria-label="Correct this payment"
        onClick={(e) => {
          e.stopPropagation();
          openDialog();
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Correct this payment</DialogTitle>
            <DialogDescription>
              Fixes the amount, date, or account on this partial payment in place.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {accountLabel(
                        a,
                        institutions.find((i) => i.id === a.institution_id)?.name,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={correct.isPending} onClick={submit}>
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
