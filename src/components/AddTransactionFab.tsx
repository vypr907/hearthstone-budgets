import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
  useBills,
  useCategories,
  useDebts,
  useInstitutions,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { accountLabel } from "@/lib/format";
import { applyClearedPayment, toPayable } from "@/lib/payments";
import { useQueryClient } from "@tanstack/react-query";


function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

const NO_CATEGORY = "__none__";
const NO_LINK = "__none__";

/**
 * One-tap manual entry. Date defaults to today and status to 'cleared' —
 * only bill/debt submissions start as 'pending'.
 */
export function AddTransactionFab() {
  const [open, setOpen] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const save = useUpsertTransaction();
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [description, setDescription] = useState("");
  /** "bill:<id>" or "debt:<id>" — mutually exclusive, optional (ADR-035). */
  const [link, setLink] = useState(NO_LINK);
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const { data: institutions = [] } = useInstitutions();
  const institutionName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);


  function reset() {
    setAccountId("");
    setAmount("");
    setCategoryId(NO_CATEGORY);
    setDescription("");
    setLink(NO_LINK);
  }

  async function submit() {
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    const n = Number(amount);
    if (!amount || !Number.isFinite(n) || n === 0) {
      toast.error("Enter an amount");
      return;
    }
    const [linkKind, linkId] = link === NO_LINK ? [null, null] : link.split(":");
    const bill = linkKind === "bill" ? bills.find((b) => b.id === linkId) : undefined;
    const debt = linkKind === "debt" ? debts.find((d) => d.id === linkId) : undefined;
    try {
      await save.mutateAsync({
        account_id: accountId,
        // Positive input means money out; type a negative amount for money in.
        amount: n > 0 ? -n : n,
        category_id: categoryId === NO_CATEGORY ? null : categoryId,
        description: description.trim() || null,
        status: "cleared",
        transaction_date: todayISO(),
        ...(bill ? { linked_bill_id: bill.id } : {}),
        ...(debt ? { linked_debt_id: debt.id } : {}),
      });
      // A linked entry is a real payment: run the same cycle update as Submit/Clear.
      if (bill || debt) {
        const payable = bill ? toPayable("bill", bill) : toPayable("debt", debt!);
        await applyClearedPayment(payable, Math.abs(n));
        qc.invalidateQueries({ queryKey: ["bills"] });
        qc.invalidateQueries({ queryKey: ["debts"] });
      }
      qc.invalidateQueries({ queryKey: ["latest_balances"] });
      qc.invalidateQueries({ queryKey: ["spending_actuals"] });
      toast.success("Transaction added");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button
        aria-label="Add transaction"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Pick an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {accountLabel(a, institutionName[a.institution_id ?? ""])}
                    </SelectItem>
                  ))}
                </SelectContent>

              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount spent</Label>
              <Input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="h-12"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Money out. Enter a negative amount for money in.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {sortedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.parent_category ? ` · ${c.parent_category}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Link to bill/debt (optional)</Label>
              <Select value={link} onValueChange={setLink}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LINK}>Not linked</SelectItem>
                  {bills.map((b) => (
                    <SelectItem key={`bill-${b.id}`} value={`bill:${b.id}`}>
                      🧾 {b.name}
                    </SelectItem>
                  ))}
                  {debts.map((d) => (
                    <SelectItem key={`debt-${d.id}`} value={`debt:${d.id}`}>
                      💳 {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Linked entries count toward that bill or debt's current cycle.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tx-desc">Description</Label>
              <Input
                id="tx-desc"
                className="h-12"
                placeholder="e.g. Groceries"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="h-12 w-full" disabled={save.isPending} onClick={submit}>
              Save transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
