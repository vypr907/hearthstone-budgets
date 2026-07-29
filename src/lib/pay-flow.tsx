import { useState } from "react";
import { toast } from "sonner";
import {
  useMarkCleared,
  useMarkSubmitted,
  useMarkUnpaid,
  type Payable,
} from "@/lib/payments";
import { useAccounts } from "@/lib/data-hooks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Action = "submitted" | "cleared";

/**
 * Shared mark-paid flow. transactions.account_id is NOT NULL, but bills/debts
 * only carry institution_id, so resolve the account from the institution:
 * one match → auto, several → picker, none → blocked with a message.
 */
export function usePayFlow() {
  const { data: accounts = [] } = useAccounts();
  const submit = useMarkSubmitted();
  const clear = useMarkCleared();
  const undo = useMarkUnpaid();
  const [choice, setChoice] = useState<{ payable: Payable; action: Action } | null>(
    null,
  );

  const busy = submit.isPending || clear.isPending || undo.isPending;

  async function perform(payable: Payable, action: Action, accountId: string) {
    try {
      const res = (await (action === "submitted" ? submit : clear).mutateAsync({
        payable,
        accountId,
      })) as { next_due_date?: string | null } | undefined;
      const msg = `${payable.name} ${action}`;
      toast.success(
        res?.next_due_date ? `${msg} · next due ${res.next_due_date}` : msg,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function start(payable: Payable, action: Action) {
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
      void perform(payable, action, matches[0].id);
      return;
    }
    setChoice({ payable, action });
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
                void perform(c.payable, c.action, a.id);
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

  return { start, markUnpaid, busy, picker };
}
