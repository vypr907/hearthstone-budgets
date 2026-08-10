import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import {
  useDebts,
  useDeleteDebt,
  useUpsertDebt,
  useCategories,
  useAccounts,
  useTransactions,
  useDeleteLinkedTransaction,
  useInstitutions,
  useDebtAdjustments,
  useAddDebtAdjustment,
  useDeleteDebtAdjustment,
} from "@/lib/data-hooks";
import { ListControls, groupRows } from "@/components/ListControls";
import { PayActions } from "@/components/PayActions";
import { StrandedDebtRepair } from "@/components/StrandedDebtRepair";

import { useCycleState } from "@/lib/ledger-state";
import { toPayable, debtRemainingOwed } from "@/lib/payments";
import {
  DetailGrid,
  DetailItem,
  DetailMoney,
  DetailText,
  StatusBadge,
  statusVariant,
} from "@/components/detail";
import { formatMoney, debtDueDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Debt, BillingCycle } from "@/lib/supabase";
import { InstitutionDialog } from "@/components/InstitutionDialog";

/** ADR-045: invoice joins the existing debt_type values. */
const DEBT_TYPES = ["medical", "credit_card", "loan", "advance", "invoice", "other"];
const ADD_INSTITUTION = "__add_institution__";
const ADJUSTMENT_TYPES = [
  "insurance_covered",
  "insurance_discount",
  "late_fee",
  "nsf_fee",
  "other",
];
import { format } from "date-fns";
import { EmojiIcon, ItemBar, itemColor } from "@/components/viz";
import { Switch } from "@/components/ui/switch";
import { PAYCHECK_DEDUCTION_ICON, formatTypeLabel } from "@/lib/visual-meta";


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

export const Route = createFileRoute("/app/debts")({
  head: () => ({
    meta: [
      { title: "Debts — Hearthstone" },
      {
        name: "description",
        content:
          "View and manage your household debts, balances, interest rates, and minimum payments in Hearthstone.",
      },
      { property: "og:title", content: "Debts — Hearthstone" },
      {
        property: "og:description",
        content:
          "View and manage your household debts, balances, interest rates, and minimum payments in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebtsPage,
});

function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts();
  const [editing, setEditing] = useState<Partial<Debt> | null>(null);
  const [detail, setDetail] = useState<Debt | null>(null);
  const infoOf = useCycleState();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("priority");
  const [group, setGroup] = useState("none");
  const [cats, setCats] = useState<string[]>([]);
  const [showPaidOff, setShowPaidOff] = useState(false);

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  const isPaidOff = (d: Debt) => Number(d.remaining_balance ?? 0) <= 0;

  const rows = useMemo(() => {
    let out = debts;
    if (!showPaidOff) out = out.filter((d) => !isPaidOff(d));
    if (cats.length) {
      out = out.filter((d) =>
        d.category_id ? cats.includes(d.category_id) : cats.includes("none"),
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter((d) => d.name.toLowerCase().includes(t));
    }
    return [...out].sort((a, b) => {
      // Paid-off debts always sink to the bottom of the list.
      if (isPaidOff(a) !== isPaidOff(b)) return isPaidOff(a) ? 1 : -1;
      if (sort === "category")
        return (categoryName[a.category_id ?? ""] ?? "zzz").localeCompare(
          categoryName[b.category_id ?? ""] ?? "zzz",
        );
      if (sort === "due")
        return (debtDueDate(a) ?? "9999-12-31").localeCompare(
          debtDueDate(b) ?? "9999-12-31",
        );
      if (sort === "remaining")
        return Number(b.remaining_balance || 0) - Number(a.remaining_balance || 0);
      return (a.priority_order ?? 9999) - (b.priority_order ?? 9999);
    });
  }, [debts, cats, q, sort, categoryName, showPaidOff]);

  const flat = useMemo(() => {
    if (group === "none") return rows.map((d) => ({ header: "", d }));
    const grouped = groupRows(rows, (d) => {
      if (group === "category") return categoryName[d.category_id ?? ""] ?? "Uncategorized";
      if (group === "due") return d.due_day ? `Day ${d.due_day}` : "No due day";
      if (group === "remaining")
        return Number(d.remaining_balance || 0) > 0 ? "Outstanding" : "Paid off";
      return d.priority_order != null ? `Priority ${d.priority_order}` : "No priority";
    });
    const out: Array<{ header: string; d: Debt }> = [];
    for (const [label, items] of grouped)
      items.forEach((d, i) => out.push({ header: i === 0 ? label : "", d }));
    return out;
  }, [rows, group, categoryName]);

  return (
    <>
      <AppHeader title="Debts" />
      <div className="space-y-3 p-4">
        <StrandedDebtRepair debts={debts} />
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add debt
        </Button>


        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && debts.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState>No debts yet.</EmptyState>
            </CardContent>
          </Card>
        )}

        <ListControls
          query={q}
          onQueryChange={setQ}
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "priority", label: "Priority order" },
            { value: "due", label: "Due day" },
            { value: "category", label: "Category" },
            { value: "remaining", label: "Remaining balance" },
          ]}
          group={group}
          onGroupChange={setGroup}
          groupOptions={[
            { value: "category", label: "Category" },
            { value: "due", label: "Due day" },
            { value: "priority", label: "Priority order" },
            { value: "remaining", label: "Balance state" },
          ]}
          categories={categories}
          selectedCategories={cats}
          onSelectedCategoriesChange={setCats}
        />

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="pr-3">
            <Label htmlFor="show-paid-off">Show paid off</Label>
            <p className="text-xs text-muted-foreground">
              Include debts with a zero balance, sorted to the bottom.
            </p>
          </div>
          <Switch
            id="show-paid-off"
            checked={showPaidOff}
            onCheckedChange={setShowPaidOff}
          />
        </div>

        <div className="space-y-2">
          {flat.map(({ header, d }, i) => {
            const start = Number(d.starting_balance ?? 0) || Number(d.remaining_balance ?? 0);
            const pctPaid =
              start > 0
                ? Math.min(
                    100,
                    Math.max(0, ((start - Number(d.remaining_balance)) / start) * 100),
                  )
                : 0;
            return (
            <div key={d.id} className="space-y-2">
            {header ? (
              <SectionLabel className="px-1 pt-2">{header}</SectionLabel>
            ) : null}
            <Card
              className="cursor-pointer"
              onClick={() => setDetail(d)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <EmojiIcon name={`${d.name} ${d.debt_type ?? ""}`} fallback="🏦" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{d.debt_type || "Debt"}</span>
                      {isPaidOff(d) ? (
                        <span>
                          · paid off{d.date_paid_off ? ` ${d.date_paid_off.slice(0, 10)}` : ""}
                        </span>
                      ) : (d.billing_cycle ?? "monthly") === "monthly"
                        ? d.due_day
                          ? <span>· day {d.due_day}</span>
                          : null
                        : d.next_due_date
                          ? <span>· due {d.next_due_date.slice(0, 10)}</span>
                          : null}
                      <span>· {formatTypeLabel(d.billing_cycle ?? "monthly")}</span>
                      {d.is_paycheck_deduction ? (
                        <Badge variant="secondary" title="Paid via paycheck/HSA deduction">
                          {PAYCHECK_DEDUCTION_ICON} Paycheck deduction
                        </Badge>
                      ) : null}
                      {d.interest_rate != null ? (
                        <span>· {Number(d.interest_rate)}% APR</span>
                      ) : null}
                      <Badge
                        variant={statusVariant(d.payment_status)}
                        className="capitalize"
                      >
                        {d.payment_status || "unpaid"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(d);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-[12px] bg-muted/50 p-2">
                    <SectionLabel size="sub">Remaining</SectionLabel>
                    <p className="text-xl font-extrabold tabular-nums">
                      {formatMoney(Number(d.remaining_balance))}
                    </p>
                  </div>
                  <div className="rounded-[12px] bg-muted/50 p-2">
                    <SectionLabel size="sub">Min payment</SectionLabel>
                    <p className="text-xl font-extrabold tabular-nums">
                      {formatMoney(Number(d.minimum_payment))}
                    </p>
                  </div>
                </div>
                {(() => {
                  const info = infoOf(toPayable("debt", d));
                  return info.clearedSum > 0 && info.remaining > 0 ? (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      {formatMoney(info.remaining)} still owed this cycle
                    </p>
                  ) : null;
                })()}
                <ItemBar className="mt-2" value={pctPaid} color={itemColor(i)} />
                <SectionLabel size="sub" className="mt-1">
                  {Math.round(pctPaid)}% paid off
                </SectionLabel>
                <PayActions
                  payable={toPayable("debt", d)}
                  className="mt-2"
                />
              </CardContent>
            </Card>
            </div>
            );
          })}

        </div>
      </div>

      <DebtDialog debt={editing} onClose={() => setEditing(null)} />
      <DebtDetailDialog
        debt={detail}
        onClose={() => setDetail(null)}
        onEdit={(d) => {
          setDetail(null);
          setEditing(d);
        }}
      />
    </>
  );
}

function DebtDetailDialog({
  debt,
  onClose,
  onEdit,
}: {
  debt: Debt | null;
  onClose: () => void;
  onEdit?: (debt: Debt) => void;
}) {
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const category = categories.find((c) => c.id === debt?.category_id);
  const account = accounts.find((a) => a.institution_id === debt?.institution_id);

  const open = debt !== null;
  if (!debt) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{debt.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DetailGrid>
            <DetailItem label="Category" value={category?.name ?? "—"} />
            <DetailItem label="Debt type" value={debt.debt_type ?? "—"} />
            <DetailItem label="Account" value={account?.name ?? "—"} />
            <DetailMoney label="Starting balance" value={debt.starting_balance} />
            <DetailMoney
              label="Program start balance"
              value={debt.program_start_balance}
            />
            <DetailMoney label="Remaining balance" value={debt.remaining_balance} />
            <DetailMoney label="Minimum payment" value={debt.minimum_payment} />
            <DetailMoney label="Paid this cycle" value={Number(debt.cycle_paid_to_date ?? 0)} />
            <DetailMoney label="Still owed this cycle" value={debtRemainingOwed(debt)} />
            <DetailItem
              label="Interest rate"
              value={
                debt.interest_rate != null ? `${debt.interest_rate}%` : "—"
              }
            />
            <DetailMoney
              label="Known finance charge"
              value={debt.known_finance_charge}
            />
            <DetailItem
              label="Billing cycle"
              value={formatTypeLabel(debt.billing_cycle ?? "monthly")}
            />
            <DetailItem
              label="Paycheck deduction"
              value={
                debt.is_paycheck_deduction ? (
                  <Badge variant="secondary">
                    {PAYCHECK_DEDUCTION_ICON} Paid via paycheck/HSA
                  </Badge>
                ) : (
                  "No"
                )
              }
            />
            {(debt.billing_cycle ?? "monthly") === "monthly" ? (
              <DetailItem
                label="Due day"
                value={debt.due_day != null ? String(debt.due_day) : "—"}
              />
            ) : (
              <DetailItem
                label="Next due date"
                value={debt.next_due_date ? debt.next_due_date.slice(0, 10) : "—"}
              />
            )}
            <DetailItem
              label="Payment status"
              value={
                <Badge
                  variant={statusVariant(debt.payment_status)}
                  className="capitalize"
                >
                  {debt.payment_status || "unpaid"}
                </Badge>
              }
            />
            <DetailItem
              label="On payment plan"
              value={
                debt.on_payment_plan === null
                  ? "—"
                  : debt.on_payment_plan
                    ? "Yes"
                    : "No"
              }
            />
            <DetailItem
              label="Manual or auto"
              value={debt.manual_or_auto ?? "—"}
            />
            <DetailItem
              label="Priority order"
              value={
                debt.priority_order != null ? String(debt.priority_order) : "—"
              }
            />
          </DetailGrid>

          <DetailText label="Notes" value={debt.notes} />
          <PayActions payable={toPayable("debt", debt)} />

          <RecentDebtTransactions debtId={debt.id} />

          <DebtAdjustments debt={debt} />

          {debt.date_paid_off && (
            <div>
              <p className="text-xs text-muted-foreground">Date paid off</p>
              <p className="mt-1 text-sm">
                {format(new Date(debt.date_paid_off), "MMM d, yyyy")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {onEdit && (
            <Button variant="outline" onClick={() => onEdit(debt)} className="h-11">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          )}
          <Button onClick={onClose} className="h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function DebtDialog({
  debt,
  onClose,
}: {
  debt: Partial<Debt> | null;
  onClose: () => void;
}) {
  const upsert = useUpsertDebt();
  const del = useDeleteDebt();
  const { data: institutions = [] } = useInstitutions();
  const [name, setName] = useState("");
  const [remaining, setRemaining] = useState("");
  const [rate, setRate] = useState("");
  const [minPay, setMinPay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [nextDue, setNextDue] = useState("");
  const [debtType, setDebtType] = useState("");
  const [institutionId, setInstitutionId] = useState("none");
  const [institutionDialogOpen, setInstitutionDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [deduction, setDeduction] = useState(false);
  const [cycleCount, setCycleCount] = useState("");
  const [cycleUnit, setCycleUnit] = useState<CycleUnit>("days");

  const open = debt !== null;
  const isEdit = !!debt?.id;
  const key = debt?.id ?? "new";
  const [lastKey, setLastKey] = useState("");
  if (open && key !== lastKey) {
    setLastKey(key);
    setName(debt?.name ?? "");
    setRemaining(debt?.remaining_balance != null ? String(debt.remaining_balance) : "");
    setRate(debt?.interest_rate != null ? String(debt.interest_rate) : "");
    setMinPay(debt?.minimum_payment != null ? String(debt.minimum_payment) : "");
    setDueDay(debt?.due_day != null ? String(debt.due_day) : "");
    setCycle((debt?.billing_cycle as BillingCycle) ?? "monthly");
    setNextDue(debt?.next_due_date ? debt.next_due_date.slice(0, 10) : "");
    setDebtType(debt?.debt_type ?? "");
    setInstitutionId(debt?.institution_id ?? "none");
    setNotes(debt?.notes ?? "");
    setDeduction(debt?.is_paycheck_deduction === true);
    const derived = deriveCustomInterval(debt?.cycle_interval_days);
    setCycleCount(derived.count);
    setCycleUnit(derived.unit);
  }
  if (!open && lastKey !== "") setLastKey("");

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const intervalDays = cycle === "custom" ? toIntervalDays(cycleCount, cycleUnit) : null;
    if (cycle === "custom" && !intervalDays) {
      toast.error("Enter how often this custom debt repeats");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: debt?.id,
        name: name.trim(),
        remaining_balance: remaining ? Number(remaining) : null,
        interest_rate: rate ? Number(rate) : null,
        minimum_payment: minPay ? Number(minPay) : null,
        due_day: cycle === "monthly" ? (dueDay ? Number(dueDay) : null) : debt?.due_day ?? null,
        billing_cycle: cycle.trim().toLowerCase() as BillingCycle,
        cycle_interval_days: intervalDays,
        next_due_date: cycle === "monthly" ? debt?.next_due_date ?? null : nextDue || null,
        debt_type: debtType || null,
        institution_id: institutionId === "none" ? null : institutionId,
        notes: notes || null,
        is_paycheck_deduction: deduction,
      });
      toast.success(isEdit ? "Debt updated" : "Debt added");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!debt?.id) return;
    if (!confirm("Delete this debt?")) return;
    try {
      await del.mutateAsync(debt.id);
      toast.success("Debt deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit debt" : "Add debt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={debtType || "none"} onValueChange={(v) => setDebtType(v === "none" ? "" : v)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unset</SelectItem>
                {DEBT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {formatTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Institution</Label>
            <Select
              value={institutionId}
              onValueChange={(v) => {
                if (v === ADD_INSTITUTION) {
                  setInstitutionDialogOpen(true);
                  return;
                }
                setInstitutionId(v);
              }}
            >
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
                <SelectItem value={ADD_INSTITUTION}>+ Add new institution</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Remaining balance</Label>
              <Input
                type="number"
                step="0.01"
                value={remaining}
                onChange={(e) => setRemaining(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Interest rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Minimum payment</Label>
              <Input
                type="number"
                step="0.01"
                value={minPay}
                onChange={(e) => setMinPay(e.target.value)}
                className="h-11"
              />
            </div>
            {cycle === "monthly" ? (
              <div>
                <Label>Due day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="h-11"
                />
              </div>
            ) : (
              <div>
                <Label>Next due date</Label>
                <Input
                  type="date"
                  value={nextDue}
                  onChange={(e) => setNextDue(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
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
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label htmlFor="d-deduction">Paid via paycheck/HSA deduction</Label>
              <p className="text-xs text-muted-foreground">
                Excluded from pay-period and monthly cash obligations (ADR-032).
              </p>
            </div>
            <Switch id="d-deduction" checked={deduction} onCheckedChange={setDeduction} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        {/* Inline institution creation keeps the in-progress debt form intact. */}
        <InstitutionDialog
          institution={institutionDialogOpen ? {} : null}
          onClose={() => setInstitutionDialogOpen(false)}
          onSaved={(id) => setInstitutionId(id)}
        />
      </DialogContent>
    </Dialog>
  );
}


/** Last 10 ledger rows linked to this debt, newest first. */
function RecentDebtTransactions({ debtId }: { debtId: string }) {
  const { data: transactions = [] } = useTransactions();
  const del = useDeleteLinkedTransaction();

  const rows = useMemo(
    () =>
      transactions
        .filter((t) => t.linked_debt_id === debtId)
        .sort((a, b) => (b.transaction_date ?? "").localeCompare(a.transaction_date ?? ""))
        .slice(0, 10),
    [transactions, debtId],
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
                  if (!confirm("Delete this ledger transaction? The debt row is left as-is.")) return;
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


/**
 * ADR-045: non-payment changes to what a debt owes (insurance coverage,
 * discounts, late/NSF fees). Adjustments only move remaining_balance — they
 * never touch transactions or account balances.
 */
function DebtAdjustments({ debt }: { debt: Debt }) {
  const { data: allAdjustments = [] } = useDebtAdjustments();
  const adjustments = useMemo(
    () => allAdjustments.filter((a) => a.debt_id === debt.id),
    [allAdjustments, debt.id],
  );
  const add = useAddDebtAdjustment();
  const remove = useDeleteDebtAdjustment();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("insurance_covered");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  async function save() {
    const value = Number(amount);
    if (!value) {
      toast.error("Enter a non-zero amount");
      return;
    }
    try {
      await add.mutateAsync({
        debt,
        amount: value,
        adjustmentType: type,
        description: description || null,
        adjustmentDate: date,
      });
      toast.success("Adjustment saved");
      setOpen(false);
      setAmount("");
      setDescription("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Adjustments
        </p>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {adjustments.length === 0 ? (
        <p className="mt-1 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          No adjustments yet.
        </p>
      ) : (
        <div className="mt-1 divide-y divide-border/50 rounded-md border">
          {adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {formatTypeLabel(a.adjustment_type ?? "other")}
                  {a.description ? ` · ${a.description}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">{a.adjustment_date}</p>
              </div>
              <span className="shrink-0 tabular-nums font-medium">
                {Number(a.amount) > 0 ? "+" : ""}
                {formatMoney(Number(a.amount))}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={async () => {
                  try {
                    await remove.mutateAsync({ adjustment: a, debt });
                    toast.success("Adjustment removed");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add adjustment</DialogTitle>
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
              <p className="mt-1 text-xs text-muted-foreground">
                Negative reduces what's owed (insurance, discount); positive increases it
                (late or NSF fee).
              </p>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
          </div>
          <DialogFooter>
            <Button className="h-11 w-full" onClick={save} disabled={add.isPending}>
              Save adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
