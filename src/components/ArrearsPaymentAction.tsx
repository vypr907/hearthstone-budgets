import { useState } from "react";
import { CircleDollarSign } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, useInstitutions } from "@/lib/data-hooks";
import { useMarkArrearsPaid, type Payable } from "@/lib/payments";
import { priorCyclesArrears, arrearsPaymentTag } from "@/lib/arrears";
import { formatMoney, accountLabel } from "@/lib/format";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * ADR-076: pay down arrears (cycles before the current one) without touching
 * the current cycle's own Submit/Clear state. Hidden entirely when nothing is
 * owed from before the current cycle. Usable repeatedly — each use is an
 * independent, separately dated ledger entry, so it also covers logging
 * multiple real historical payments for record-keeping.
 */
export function ArrearsPaymentAction({
  payable,
  className,
}: {
  payable: Payable;
  className?: string;
}) {
  const priorArrears = priorCyclesArrears(payable);
  const { data: accounts = [] } = useAccounts();
  const { data: institutions = [] } = useInstitutions();
  const markArrears = useMarkArrearsPaid();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(todayISO());

  if (priorArrears <= 0.005) return null;

  function openDialog() {
    setAmount(String(priorArrears));
    setAccountId("");
    setDate(todayISO());
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
      await markArrears.mutateAsync({
        payable,
        accountId,
        amount: value,
        priorArrears,
        resolvedTag: arrearsPaymentTag(payable),
        date,
      });
      toast.success(`${formatMoney(value)} logged against arrears`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        className={`h-11 w-full justify-start gap-2 ${className ?? ""}`}
        onClick={(e) => {
          e.stopPropagation();
          openDialog();
        }}
      >
        <CircleDollarSign className="h-4 w-4" />
        <span>Log arrears payment</span>
        <span className="ml-auto text-xs opacity-80">{formatMoney(priorArrears)} owed</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Log a payment against arrears</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Credits money owed from before the current cycle — {payable.name}'s
              current cycle is untouched. Usable more than once for separate
              historical payments.
            </p>
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
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {formatMoney(priorArrears)} owed from before this cycle.
              </p>
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
            <Button
              className="h-11 w-full"
              disabled={markArrears.isPending}
              onClick={submit}
            >
              Log payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
