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
  useSaveSplitTransaction,
  useUpsertInstitution,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import {
  categoryVisual,
  guessMerchantDomain,
  suggestedLogoUrl,
} from "@/lib/visual-meta";
import { Switch } from "@/components/ui/switch";
import {
  SplitLinesEditor,
  emptySplitRow,
  splitRowsTotal,
  NO_SPLIT_CATEGORY,
  type SplitRow,
} from "@/components/SplitLinesEditor";
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
  const saveSplit = useSaveSplitTransaction();
  const qc = useQueryClient();

  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [description, setDescription] = useState("");
  /** "bill:<id>" or "debt:<id>" — mutually exclusive, optional (ADR-035). */
  const [link, setLink] = useState(NO_LINK);
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  /** ADR-044: split entries carry per-category lines instead of one category. */
  const [isSplit, setIsSplit] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([emptySplitRow()]);

  /** Trimmed description that doesn't match any known institution yet. */
  const newMerchant = useMemo(() => {
    const d = description.trim();
    if (d.length < 3) return null;
    const known = institutions.some(
      (i) => i.name.trim().toLowerCase() === d.toLowerCase(),
    );
    return known ? null : d;
  }, [description, institutions]);

  async function addMerchant() {
    if (!newMerchant) return;
    const domain = guessMerchantDomain(newMerchant);
    try {
      await saveInstitution.mutateAsync({
        name: newMerchant,
        institution_type: "retailer",
        logo_url: domain ? suggestedLogoUrl(domain) : null,
      });
      toast.success(`Added ${newMerchant}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add place");
    }
  }

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const { data: institutions = [] } = useInstitutions();
  const saveInstitution = useUpsertInstitution();
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
    setIsSplit(false);
    setSplitRows([emptySplitRow()]);
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
    if (isSplit) {
      const lines = splitRows.filter((r) => Number(r.amount));
      if (lines.length < 2) {
        toast.error("Add at least two split lines");
        return;
      }
      if (Math.abs(splitRowsTotal(lines) - n) > 0.005) {
        toast.error("Split lines must add up to the total amount");
        return;
      }
      try {
        await saveSplit.mutateAsync({
          accountId,
          transactionDate: todayISO(),
          description: description.trim() || null,
          status: "cleared",
          lines: lines.map((r) => ({
            categoryId: r.categoryId === NO_SPLIT_CATEGORY ? null : r.categoryId,
            // Positive input means money out, same as the single-row flow.
            amount: n > 0 ? -Number(r.amount) : Number(r.amount),
          })),
        });
        toast.success("Split transaction added");
        reset();
        setOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
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

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="pr-3">
                <Label htmlFor="tx-split">Split into multiple categories</Label>
                <p className="text-xs text-muted-foreground">
                  One entry, several category lines that must add up to the total.
                </p>
              </div>
              <Switch id="tx-split" checked={isSplit} onCheckedChange={setIsSplit} />
            </div>

            {isSplit ? (
              <SplitLinesEditor
                rows={splitRows}
                categories={sortedCategories}
                total={Number(amount) || 0}
                onChange={setSplitRows}
              />
            ) : (
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY} className="py-3 text-base">
                    No category
                  </SelectItem>
                  {sortedCategories.map((c) => {
                    const v = categoryVisual(c);
                    return (
                      <SelectItem key={c.id} value={c.id} className="py-3 text-base">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-base"
                            style={{ background: `${v.color}22` }}
                          >
                            {v.icon}
                          </span>
                          <span className="font-medium" style={{ color: v.color }}>
                            {c.name}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            )}

            {!isSplit ? (
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
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="tx-desc">Description</Label>
              <Input
                id="tx-desc"
                className="h-12"
                placeholder="e.g. Groceries"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {/* Inline merchant capture: typed places that aren't tracked yet
                  can become an institution without leaving the form. */}
              {newMerchant ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[12px] bg-muted/50 p-2 text-left text-xs active:bg-muted"
                  disabled={saveInstitution.isPending}
                  onClick={() => void addMerchant()}
                >
                  <span aria-hidden className="text-base">
                    🏪
                  </span>
                  <span className="min-w-0 flex-1">
                    New place? Save{" "}
                    <span className="font-semibold">{newMerchant}</span> as an
                    institution
                  </span>
                </button>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              className="h-12 w-full"
              disabled={save.isPending || saveSplit.isPending}
              onClick={submit}
            >
              {isSplit ? "Save split transaction" : "Save transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
