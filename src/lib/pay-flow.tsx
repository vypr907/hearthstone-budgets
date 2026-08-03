import { useState } from "react";
import { toast } from "sonner";
import {
  billCycleDue,
  billRemainingOwed,
  useMarkCleared,
  useMarkSubmitted,
  useMarkUnpaid,
  type Payable,
} from "@/lib/payments";
import { useAccounts, useTransactions } from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = "submitted" | "cleared";

/** Amount to pre-fill for a variable-amount bill's current cycle. */
function defaultCycleAmount(payable: Payable) {
  const bill = payable.bill;
  if (!bill) return payable.amount;
  const paid = Number(bill.cycle_paid_to_date ?? 0);
  if (paid > 0) return billRemainingOwed(bill);
  return billCycleDue(bill);
}

/**
 * Shared mark-paid flow. transactions.account_id is NOT NULL, but bills/debts
 * only carry institution_id, so resolve the account from the institution:
 * one match → auto, several → picker, none → blocked with a message.
 * Variable-amount bills first prompt for the amount owed this cycle.
 */
export function usePayFlow() {
  const { data: accounts = [] } = useAccounts();
  const { data: transactions = [] } = useTransactions();
  const submit = useMarkSubmitted();
  const clear = useMarkCleared();
  const undo = useMarkUnpaid();
  const [choice, setChoice] = useState<
    { payable: Payable; action: Action; amount?: number } | null
  >(null);
  const [ask, setAsk] = useState<{ payable: Payable; action: Action } | null>(null);
  const [askValue, setAskValue] = useState("");

  const busy = submit.isPending || clear.isPending || undo.isPending;

  async function perform(
    payable: Payable,
    action: Action,
    accountId: string,
    amount?: number,
  ) {
    try {
      const res = (await (action === "submitted" ? submit : clear).mutateAsync({
        payable,
        accountId,
        amount,
      })) as
        | { next_due_date?: string | null; remaining_owed?: number }
        | undefined;
      const msg = `${payable.name} ${action}`;
      if (res?.remaining_owed) {
        toast.success(`${msg} · ${formatMoney(res.remaining_owed)} still owed this cycle`);
      } else if (res?.next_due_date) {
        toast.success(`${msg} · next due ${res.next_due_date}`);
      } else {
        toast.success(msg);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function resolveAccount(payable: Payable, action: Action, amount?: number) {
    const matches = payable.institution_id
      ? accounts.filter((a) => a.institution_id === payable.institution_id)
      : [];
    if (matches.length === 0) {
      toast.error(
        `No account linked to ${payable.name}'s institution — add an account to that institution first.`,
      );
      return;
    }
    if (matches.length === 1) {
      void perform(payable, action, matches[0].id, amount);
      return;
    }
    setChoice({ payable, action, amount });
  }

  function start(payable: Payable, action: Action) {
    if (payable.kind === "bill" && payable.bill?.is_variable_amount) {
      setAskValue(String(defaultCycleAmount(payable) || ""));
      setAsk({ payable, action });
      return;
    }
    resolveAccount(payable, action);
  }

  async function markUnpaid(payable: Payable) {
    try {
      await undo.mutateAsync(payable);
      toast.success(`${payable.name} set to unpaid`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }


  const options = choice
    ? accounts.filter((a) => a.institution_id === choice.payable.institution_id)
    : [];

  const picker = (
    <Dialog open={!!choice} onOpenChange={(o) => !o && setChoice(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which account paid this?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((a) => (
            <Button
              key={a.id}
              variant="outline"
              className="h-12 w-full justify-start"
              onClick={() => {
                const c = choice!;
                setChoice(null);
                void perform(c.payable, c.action, a.id, c.amount);
              }}
            >
              {a.name}
              {a.account_type ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {a.account_type}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );

  const amountPrompt = (
    <Dialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Amount owed this cycle</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pay-amount">{ask?.payable.name}</Label>
          <Input
            id="pay-amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            className="h-12 text-base"
            value={askValue}
            onChange={(e) => setAskValue(e.target.value)}
          />
          {ask?.payable.bill && Number(ask.payable.bill.cycle_paid_to_date ?? 0) > 0 ? (
            <p className="text-xs text-muted-foreground">
              {formatMoney(Number(ask.payable.bill.cycle_paid_to_date ?? 0))} already paid
              of {formatMoney(billCycleDue(ask.payable.bill))} due this cycle.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            className="h-12 w-full"
            onClick={() => {
              const value = Number(askValue);
              if (!value || value <= 0) {
                toast.error("Enter an amount greater than zero");
                return;
              }
              const a = ask!;
              setAsk(null);
              resolveAccount(a.payable, a.action, value);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );


  return {
    start,
    markUnpaid,
    busy,
    picker: (
      <>
        {picker}
        {amountPrompt}
      </>
    ),
  };
}
