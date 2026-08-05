import { useMemo, useState } from "react";
import { PiggyBank } from "lucide-react";
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
import {
  useAccounts,
  useSavingsGoals,
  useUpsertSavingsGoal,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { accountLast4, formatMoney, monthlyEquivalent } from "@/lib/format";
import type { Bill } from "@/lib/supabase";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * ADR-038: "Set Aside" moves money from a spending account into a bill's
 * envelope goal as TWO ordinary cleared transactions — a debit on the source
 * account and a matching credit tagged with linked_goal_id (which is what
 * drives the envelope's derived balance, ADR-027). No transfer table exists;
 * the pairing lives only in this action.
 */
export function SetAsideAction({ bill }: { bill: Bill }) {
  const { data: goals = [] } = useSavingsGoals();
  const { data: accounts = [] } = useAccounts();
  const upsertGoal = useUpsertSavingsGoal();
  const upsertTx = useUpsertTransaction();

  const goal = useMemo(
    () => goals.find((g) => g.linked_bill_id === bill.id) ?? null,
    [goals, bill.id],
  );

  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!goal) return null;

  const suggested = monthlyEquivalent(bill) ?? Number(bill.amount ?? 0);
  const needsDest = !goal.account_id;

  const label = (a: (typeof accounts)[number]) => {
    const last4 = accountLast4(a.account_number);
    return `${a.name}${last4 ? ` · •••${last4}` : ""}`;
  };

  const start = () => {
    setSourceId("");
    setDestId(goal.account_id ?? "");
    setAmount(String(Math.round(suggested * 100) / 100));
    setOpen(true);
  };

  const confirm = async () => {
    const amt = Math.abs(Number(amount) || 0);
    if (!sourceId) return toast.error("Pick the account the money comes from");
    if (!amt) return toast.error("Enter an amount");
    const destination = goal.account_id ?? destId;
    if (!destination) return toast.error("Pick where this envelope's money lives");

    setBusy(true);
    try {
      if (!goal.account_id) {
        await upsertGoal.mutateAsync({
          id: goal.id,
          name: goal.name,
          target_amount: Number(goal.target_amount ?? 0),
          account_id: destination,
        });
      }
      const description = `Set aside: ${bill.name} -> ${goal.name}`;
      const date = todayISO();
      // (a) money leaves the source account — not tagged to the goal.
      await upsertTx.mutateAsync({
        account_id: sourceId,
        category_id: bill.category_id,
        amount: -amt,
        status: "cleared",
        description,
        transaction_date: date,
      });
      // (b) money lands in the envelope — this row is the envelope balance.
      await upsertTx.mutateAsync({
        account_id: destination,
        category_id: bill.category_id,
        amount: amt,
        status: "cleared",
        description,
        transaction_date: date,
        linked_goal_id: goal.id,
      });
      toast.success(`${formatMoney(amt)} set aside for ${goal.name}`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="h-12 w-full justify-start gap-2" onClick={start}>
        <PiggyBank className="h-5 w-5" />
        <span>Set aside</span>
        <span className="ml-auto text-xs opacity-80">
          {goal.name} · {formatMoney(suggested)}/mo
        </span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set aside for {goal.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>From account</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {label(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsDest ? (
              <div>
                <Label>Envelope lives in</Label>
                <Select value={destId} onValueChange={setDestId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {label(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved to this envelope for next time.
                </p>
              </div>
            ) : null}
            <div>
              <Label htmlFor="set-aside-amt">Amount</Label>
              <Input
                id="set-aside-amt"
                type="number"
                step="0.01"
                inputMode="decimal"
                className="h-11"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Monthly equivalent of this bill: {formatMoney(suggested)}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="h-11" disabled={busy} onClick={confirm}>
              Set aside
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
