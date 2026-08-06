import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useBills,
  useDeleteBill,
  useUpsertBill,
  useCategories,
  useInstitutions,
  useTransactions,
  useDeleteLinkedTransaction,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Bill, BillingCycle } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailMoney, DetailText, StatusBadge } from "@/components/detail";
import { ListControls, groupRows } from "@/components/ListControls";
import { PayActions } from "@/components/PayActions";
import { SetAsideAction } from "@/components/SetAsideAction";

import { useCycleState, stateVisual } from "@/lib/ledger-state";
import { Switch } from "@/components/ui/switch";
import { billCycleDue, billRemainingOwed, toPayable } from "@/lib/payments";
import { EmojiIcon, ItemBar, itemColor } from "@/components/viz";
import { formatTypeLabel } from "@/lib/visual-meta";


import {
  CustomCycleFields,
  deriveCustomInterval,
  toIntervalDays,
  type CycleUnit,
} from "@/components/CustomCycleFields";

const CYCLES: BillingCycle[] = [
  "monthly",
  "biweekly",
  "quarterly",
  "bimonthly",
  "annually",
  "custom",
];

export const Route = createFileRoute("/app/bills")({
  head: () => ({
    meta: [
      { title: "Bills — Hearthstone" },
      {
        name: "description",
        content:
          "Track upcoming household bills, due dates, amounts, and payment status in Hearthstone.",
      },
      { property: "og:title", content: "Bills — Hearthstone" },
      {
        property: "og:description",
        content:
          "Track upcoming household bills, due dates, amounts, and payment status in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillsPage,
});

function BillsPage() {
  const { data: bills = [], isLoading } = useBills();
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<Partial<Bill> | null>(null);
  const [detail, setDetail] = useState<Bill | null>(null);
  const infoOf = useCycleState();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState("due");
  const [group, setGroup] = useState("none");
  const [cats, setCats] = useState<string[]>([]);

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  const rows = useMemo(() => {
    let out = bills;
    if (cats.length) {
      out = out.filter((b) =>
        b.category_id ? cats.includes(b.category_id) : cats.includes("none"),
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((b) => b.name.toLowerCase().includes(t));
    }
    return [...out].sort((a, b) => {
      if (sort === "category")
        return (categoryName[a.category_id ?? ""] ?? "zzz").localeCompare(
          categoryName[b.category_id ?? ""] ?? "zzz",
        );
      if (sort === "cycle") return (a.billing_cycle ?? "").localeCompare(b.billing_cycle ?? "");
      if (sort === "amount") return Number(b.amount || 0) - Number(a.amount || 0);
      return (a.next_due_date ?? "9999-12-31").localeCompare(b.next_due_date ?? "9999-12-31");
    });
  }, [bills, cats, q, sort, categoryName]);

  const groups = useMemo(() => {
    if (group === "none") return [["", rows]] as Array<[string, Bill[]]>;
    return groupRows(rows, (b) => {
      if (group === "category") return categoryName[b.category_id ?? ""] ?? "Uncategorized";
      if (group === "cycle") return b.billing_cycle ?? "No cycle";
      return b.next_due_date ? b.next_due_date.slice(0, 7) : "No due date";
    });
  }, [rows, group, categoryName]);

  return (
    <>
      <AppHeader title="Bills" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add bill
        </Button>

        <ListControls
          query={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "due", label: "Next due date" },
            { value: "category", label: "Category" },
            { value: "cycle", label: "Billing cycle" },
            { value: "amount", label: "Amount" },
          ]}
          group={group}
          onGroupChange={setGroup}
          groupOptions={[
            { value: "category", label: "Category" },
            { value: "due", label: "Due month" },
            { value: "cycle", label: "Billing cycle" },
          ]}
          categories={categories}
          selectedCategories={cats}
          onSelectedCategoriesChange={setCats}
        />

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No bills match.
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {groups.map(([label, items]) => (
            <div key={label || "all"} className="space-y-2">
              {label && (
                <h2 className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </h2>
              )}
              {items.map((b, i) => {
                const info = infoOf(toPayable("bill", b));
                const stateLabel = stateVisual(info.state).label;
                const due = billCycleDue(b);
                const paid = Number(b.cycle_paid_to_date ?? 0);
                const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
                return (
                <Card key={b.id} className="cursor-pointer" onClick={() => setDetail(b)}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <EmojiIcon
                        name={`${b.name} ${
                          (b.category_id && categoryName[b.category_id]) || ""
                        }`}
                        fallback="🧾"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.name}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {b.next_due_date ? `Due ${b.next_due_date}` : "No due date"}
                          </span>
                          {b.billing_cycle ? <span>· {b.billing_cycle}</span> : null}
                          {b.category_id && categoryName[b.category_id] ? (
                            <span>· {categoryName[b.category_id]}</span>
                          ) : null}
                          {b.is_variable_amount ? <span>· variable</span> : null}
                          <StatusBadge status={info.state} />
                          {info.clearedSum > 0 && info.remaining > 0 ? (
                            <span className="font-medium text-destructive">
                              {formatMoney(info.remaining)} still owed this cycle
                            </span>
                          ) : null}
                          <span className="sr-only">{stateLabel}</span>
                        </div>
                      </div>
                      <p className="shrink-0 text-lg font-extrabold tabular-nums">
                        {formatMoney(Number(b.amount))}
                      </p>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(b);
                        }}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    {paid > 0 ? (
                      <ItemBar className="mt-2" value={pct} color={itemColor(i)} />
                    ) : null}
                    <PayActions
                      payable={toPayable("bill", b)}
                      className="mt-2"
                    />
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <SetAsideAction bill={b} compact />
                    </div>
                  </CardContent>
                </Card>
                );
              })}

            </div>
          ))}
        </div>
      </div>

      <BillDialog bill={editing} onClose={() => setEditing(null)} />
      <BillDetailDialog
        bill={detail}
        onClose={() => setDetail(null)}
        onEdit={(b) => {
          setDetail(null);
          setEditing(b);
        }}
      />
    </>
  );
}

function BillDetailDialog({
  bill,
  onClose,
  onEdit,
}: {
  bill: Bill | null;
  onClose: () => void;
  onEdit: (bill: Bill) => void;
}) {
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  if (!bill) return null;
  const category = categories.find((c) => c.id === bill.category_id);
  const institution = institutions.find((i) => i.id === bill.institution_id);
  // Only surface cycle figures when they add information beyond bills.amount.
  const showCycle =
    Number(bill.cycle_paid_to_date ?? 0) > 0 || bill.cycle_amount_due != null;


  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DetailGrid>
            <DetailItem label="Category" value={category?.name ?? "—"} />
            <DetailItem label="Institution / account" value={institution?.name ?? "—"} />
            <DetailMoney label="Amount" value={bill.amount} />
            <DetailItem label="Next due date" value={bill.next_due_date ?? "—"} />
            <DetailItem label="Billing cycle" value={bill.billing_cycle ?? "—"} />
            <DetailItem
              label="Payment status"
              value={<StatusBadge status={bill.payment_status} />}
            />
            <DetailItem label="Manual or auto" value={bill.manual_or_auto ?? "—"} />
            <DetailItem
              label="Variable amount"
              value={bill.is_variable_amount ? "Yes" : "No"}
            />
            <DetailItem
              label="Active"
              value={bill.is_active === null ? "—" : bill.is_active ? "Yes" : "No"}
            />
            {showCycle ? (
              <>
                <DetailMoney label="Due this cycle" value={billCycleDue(bill)} />
                <DetailMoney label="Paid this cycle" value={Number(bill.cycle_paid_to_date ?? 0)} />
                <DetailMoney label="Remaining owed" value={billRemainingOwed(bill)} />
              </>
            ) : null}
          </DetailGrid>
          <DetailText label="Notes" value={bill.notes} />
          <PayActions payable={toPayable("bill", bill)} />
          <SetAsideAction bill={bill} />
          <RecentBillTransactions billId={bill.id} />


        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onEdit(bill)} className="h-11">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button onClick={onClose} className="h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Last 10 ledger rows linked to this bill, newest first (ADR-035). */
function RecentBillTransactions({ billId }: { billId: string }) {
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();
  const rows = useMemo(
    () =>
      transactions
        .filter((t) => t.linked_bill_id === billId)
        .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
        .slice(0, 10),
    [transactions, billId],
  );

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recent transactions
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No payments logged yet.</p>
      ) : (
        <div className="mt-1 divide-y divide-border/50">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {t.transaction_date?.slice(0, 10)}
                {t.description ? ` · ${t.description}` : ""}
              </span>
              <span className="ml-2 shrink-0 text-xs capitalize text-muted-foreground">
                {t.status ?? "—"}
              </span>
              <span className="ml-2 shrink-0 tabular-nums">
                {formatMoney(Number(t.amount ?? 0))}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 h-9 w-9 shrink-0"
                aria-label="Delete transaction"
                disabled={del.isPending}
                onClick={() => {
                  if (!confirm("Delete this ledger transaction? The bill row is left as-is.")) return;
                  del.mutate(t, {
                    onSuccess: () => toast.success("Transaction deleted"),
                    onError: (e: unknown) => toast.error((e as Error).message),
                  });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillDialog({ bill, onClose }: { bill: Partial<Bill> | null; onClose: () => void }) {
  const upsert = useUpsertBill();
  const del = useDeleteBill();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [categoryId, setCategoryId] = useState("none");
  const [institutionId, setInstitutionId] = useState("none");
  const [manual, setManual] = useState("none");
  const [notes, setNotes] = useState("");
  const [variable, setVariable] = useState(false);
  const [cycleCount, setCycleCount] = useState("");
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>("days");

  const open = bill !== null;
  const isEdit = !!bill?.id;

  const key = bill?.id ?? "new";
  const [lastKey, setLastKey] = useState<string>("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(bill?.name ?? "");
    setAmount(bill?.amount != null ? String(bill.amount) : "");
    setDueDay(bill?.next_due_date ?? "");
    setCycle((bill?.billing_cycle as BillingCycle) ?? "monthly");
    setCategoryId(bill?.category_id ?? "none");
    setInstitutionId(bill?.institution_id ?? "none");
    setManual(bill?.manual_or_auto ?? "none");
    setNotes(bill?.notes ?? "");
    setVariable(!!bill?.is_variable_amount);
    const derived = deriveCustomInterval(bill?.cycle_interval_days);
    setCycleCount(derived.count);
    setCycleUnit(derived.unit);
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim() || !amount) {
      toast.error("Name and amount are required");
      return;
    }
    const intervalDays = cycle === "custom" ? toIntervalDays(cycleCount, cycleUnit) : null;
    if (cycle === "custom" && !intervalDays) {
      toast.error("Enter how often this custom bill repeats");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: bill?.id,
        name: name.trim(),
        amount: Number(amount),
        next_due_date: dueDay || null,
        billing_cycle: cycle.trim().toLowerCase() as BillingCycle,
        cycle_interval_days: intervalDays,
        category_id: categoryId === "none" ? null : categoryId,
        institution_id: institutionId === "none" ? null : institutionId,
        manual_or_auto: manual === "none" ? null : manual.trim().toLowerCase(),
        notes: notes || null,
        is_variable_amount: variable,
      });
      toast.success(isEdit ? "Bill updated" : "Bill added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!bill?.id) return;
    if (!confirm("Delete this bill?")) return;
    try {
      await del.mutateAsync(bill.id);
      toast.success("Bill deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bill" : "Add bill"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="b-name">Name</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-amt">{variable ? "Typical amount" : "Amount"}</Label>
              <Input
                id="b-amt"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="b-day">Next due date</Label>
              <Input
                id="b-day"
                type="date"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label htmlFor="b-variable">Variable amount</Label>
              <p className="text-xs text-muted-foreground">
                Ask what's owed each cycle when marking this bill paid.
              </p>
            </div>
            <Switch id="b-variable" checked={variable} onCheckedChange={setVariable} />
          </div>

          <div>
            <Label>Billing cycle</Label>
            <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CYCLES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {formatTypeLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cycle === "custom" ? (
            <CustomCycleFields
              count={cycleCount}
              unit={cycleUnit}
              onCountChange={setCycleCount}
              onUnitChange={setCycleUnit}
            />
          ) : null}
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Institution</Label>
            <Select value={institutionId} onValueChange={setInstitutionId}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Manual or auto</Label>
            <Select value={manual} onValueChange={setManual}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                <SelectItem value="manual">manual</SelectItem>
                <SelectItem value="auto">auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea id="b-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit ? (
            <Button variant="destructive" onClick={handleDelete} className="h-11">
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={upsert.isPending} className="h-11">
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
