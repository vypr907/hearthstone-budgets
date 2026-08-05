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
import { useAccounts, useInstitutions, useTransactions } from "@/lib/data-hooks";
import { accountLast4, formatMoney } from "@/lib/format";
import { accountTypeVisual } from "@/lib/visual-meta";
import { InstitutionLogo } from "@/components/InstitutionLogo";

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
type Stage = "cycle" | "pay";


/**
 * Shared mark-paid flow. transactions.account_id is NOT NULL, but bills/debts
 * carry no account, so the payer is picked from ALL household accounts at pay
 * time (ADR-007 correction 2026-08-03), defaulting to the account that last
 * paid this same bill/debt. Variable-amount bills first prompt for the amount.
 */
export function usePayFlow() {
  const { data: accounts = [] } = useAccounts();
  const { data: institutions = [] } = useInstitutions();

  const { data: transactions = [] } = useTransactions();
  const submit = useMarkSubmitted();
  const clear = useMarkCleared();
  const undo = useMarkUnpaid();
  const [choice, setChoice] = useState<
    { payable: Payable; action: Action; amount?: number; cycleAmount?: number } | null
  >(null);
  const [ask, setAsk] = useState<{
    payable: Payable;
    action: Action;
    stage: Stage;
    cycleAmount?: number;
  } | null>(null);
  const [askValue, setAskValue] = useState("");

  const busy = submit.isPending || clear.isPending || undo.isPending;

  async function perform(
    payable: Payable,
    action: Action,
    accountId: string,
    amount?: number,
    cycleAmount?: number,
  ) {
    try {
      const res = (await (action === "submitted" ? submit : clear).mutateAsync({
        payable,
        accountId,
        amount,
        cycleAmount,
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

  /** Account that most recently paid this specific bill/debt, if any. */
  function lastPaidAccountId(payable: Payable): string | null {
    const match = transactions.find((t) =>
      payable.kind === "bill"
        ? t.linked_bill_id === payable.id
        : t.linked_debt_id === payable.id,
    );
    return match?.account_id ?? null;
  }

  function resolveAccount(
    payable: Payable,
    action: Action,
    amount?: number,
    cycleAmount?: number,
  ) {
    // Any household account can pay any bill/debt (ADR-007 correction 2026-08-03).
    setChoice({ payable, action, amount, cycleAmount });
  }

  /** Amount to pre-fill for the "paying now" prompt: whatever is still owed. */
  function defaultPayAmount(payable: Payable, cycleAmount?: number) {
    if (payable.kind === "bill" && payable.bill) {
      if (cycleAmount != null) {
        return Math.max(0, cycleAmount - Number(payable.bill.cycle_paid_to_date ?? 0));
      }
      return billRemainingOwed(payable.bill) || billCycleDue(payable.bill);
    }
    return payableRemainingOwed(payable) || payable.amount;
  }

  /** Ask what's owed this cycle (variable bills only), then how much is being paid now. */
  function start(payable: Payable, action: Action) {
    const needsCycle =
      payable.kind === "bill" &&
      !!payable.bill?.is_variable_amount &&
      payable.bill?.cycle_amount_due == null;
    if (needsCycle) {
      setAskValue(String(billCycleDue(payable.bill!) || ""));
      setAsk({ payable, action, stage: "cycle" });
      return;
    }
    setAskValue(String(defaultPayAmount(payable) || ""));
    setAsk({ payable, action, stage: "pay" });
  }


  async function markUnpaid(payable: Payable) {
    try {
      await undo.mutateAsync(payable);
      toast.success(`${payable.name} set to unpaid`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }


  const options = choice ? accounts : [];
  const defaultAccountId = choice ? lastPaidAccountId(choice.payable) : null;

  const picker = (
    <Dialog open={!!choice} onOpenChange={(o) => !o && setChoice(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which account paid this?</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts yet — add an account first.
            </p>
          ) : null}
          {options.map((a) => {
            const visual = accountTypeVisual(a.account_type);
            const inst = institutions.find((i) => i.id === a.institution_id);
            const last4 = accountLast4(a.account_number);
            return (
              <Button
                key={a.id}
                variant={a.id === defaultAccountId ? "default" : "outline"}
                className="h-14 w-full justify-start gap-2"
                onClick={() => {
                  const c = choice!;
                  setChoice(null);
                  void perform(c.payable, c.action, a.id, c.amount);
                }}
              >
                <span aria-hidden className="text-lg" title={a.account_type ?? undefined}>
                  {visual.icon}
                </span>
                <span className="truncate">{a.name}</span>
                {inst || last4 ? (
                  <span className="ml-2 flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-xs">
                    <InstitutionLogo
                      logoUrl={inst?.logo_url}
                      type={inst?.institution_type}
                      size={16}
                    />
                    {last4 ? <span className="tabular-nums">•••{last4}</span> : null}
                  </span>
                ) : null}
                {a.id === defaultAccountId ? (
                  <span className="ml-auto text-xs opacity-80">Last used</span>
                ) : null}
              </Button>
            );
          })}

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
