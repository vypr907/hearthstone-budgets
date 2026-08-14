import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useTransactions,
  useAccounts,
  useCategories,
  useInstitutions,
  useBills,
  useDebts,
  useUpsertTransaction,
} from "@/lib/data-hooks";
import { useMarkCleared, toPayable } from "@/lib/payments";
import { formatMoney } from "@/lib/format";
import { groupLedgerRows, type LedgerEntry } from "@/lib/split-groups";

export const Route = createFileRoute("/app/pending")({
  head: () => ({
    meta: [
      { title: "Pending — Hearthstone" },
      {
        name: "description",
        content:
          "Review every pending household transaction and clear it once the money actually moves.",
      },
      { property: "og:title", content: "Pending — Hearthstone" },
      {
        property: "og:description",
        content:
          "Review every pending household transaction and clear it once the money actually moves.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const { data: transactions = [], isLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();

  const markCleared = useMarkCleared();
  const upsertTransaction = useUpsertTransaction();

  const [sort, setSort] = useState("date");
  const [groupBy, setGroupBy] = useState("none");
  const [confirm, setConfirm] = useState<LedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const accountName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = a.name;
    return m;
  }, [accounts]);
  const categoryName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);
  const institutionName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of institutions) m[i.id] = i.name;
    return m;
  }, [institutions]);
  const billById = useMemo(() => {
    const m: Record<string, (typeof bills)[number]> = {};
    for (const b of bills) m[b.id] = b;
    return m;
  }, [bills]);
  const debtById = useMemo(() => {
    const m: Record<string, (typeof debts)[number]> = {};
    for (const d of debts) m[d.id] = d;
    return m;
  }, [debts]);

  const entries = useMemo(() => {
    const pending = transactions.filter((t) => t.status === "pending");
    const grouped = groupLedgerRows(pending);
    return [...grouped].sort((a, b) => {
      const ta = a.head;
      const tb = b.head;
      if (sort === "amount") return Math.abs(tb.total ?? 0) - Math.abs(ta.total ?? 0) || Math.abs(Number(b.total)) - Math.abs(Number(a.total));
      if (sort === "account")
        return ((ta.account_id && accountName[ta.account_id]) || "").localeCompare(
          (tb.account_id && accountName[tb.account_id]) || "",
        );
      if (sort === "category")
        return ((ta.category_id && categoryName[ta.category_id]) || "").localeCompare(
          (tb.category_id && categoryName[tb.category_id]) || "",
        );
      // Date: soonest first.
      return ta.transaction_date.localeCompare(tb.transaction_date);
    });
  }, [transactions, sort, accountName, categoryName]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ label: "", items: entries }];
    const buckets = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const t = e.head;
      const key =
        groupBy === "account"
          ? (t.account_id && accountName[t.account_id]) || "No account"
          : (t.category_id && categoryName[t.category_id]) || "Uncategorized";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(e);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items }));
  }, [entries, groupBy, accountName, categoryName]);

  const total = entries.reduce((s, e) => s + Math.abs(e.total), 0);

  function linkedName(e: LedgerEntry) {
    const t = e.head;
    if (t.linked_bill_id) return billById[t.linked_bill_id]?.name ?? null;
    if (t.linked_debt_id) return debtById[t.linked_debt_id]?.name ?? null;
    return null;
  }

  async function clearEntry(e: LedgerEntry) {
    const t = e.head;
    setBusy(true);
    try {
      // ADR-035/036/046: bill/debt-linked rows clear through the shared payment
      // path so the cycle credit + due-date rollover happen exactly as they do
      // from Bills/Debts/Everything.
      if (t.linked_bill_id && billById[t.linked_bill_id]) {
        await markCleared.mutateAsync({
          payable: toPayable("bill", billById[t.linked_bill_id]!),
          accountId: t.account_id!,
        });
      } else if (t.linked_debt_id && debtById[t.linked_debt_id]) {
        await markCleared.mutateAsync({
          payable: toPayable("debt", debtById[t.linked_debt_id]!),
          accountId: t.account_id!,
        });
      } else {
        // Plain manual entry (incl. every row of a split group).
        for (const row of e.rows) {
          await upsertTransaction.mutateAsync({
            id: row.id,
            amount: Number(row.amount),
            status: "cleared",
          });
        }
      }
      toast.success("Marked cleared");
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't clear that transaction");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="Pending" />
      <div className="space-y-3 p-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <SectionLabel>Pending total</SectionLabel>
              <p className="text-2xl font-semibold">{formatMoney(total)}</p>
            </div>
            <Badge variant="secondary">{entries.length} item{entries.length === 1 ? "" : "s"}</Badge>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort: Date</SelectItem>
              <SelectItem value="amount">Sort: Amount</SelectItem>
              <SelectItem value="account">Sort: Account</SelectItem>
              <SelectItem value="category">Sort: Category</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="account">Group: Account</SelectItem>
              <SelectItem value="category">Group: Category</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : entries.length === 0 ? (
          <EmptyState>Nothing pending — everything has cleared.</EmptyState>
        ) : (
          groups.map((g) => {
            const subtotal = g.items.reduce((s, e) => s + Math.abs(e.total), 0);
            return (
              <div key={g.label || "all"} className="space-y-2">
                {g.label ? (
                  <div className="flex items-baseline justify-between pt-1">
                    <SectionLabel>{g.label}</SectionLabel>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatMoney(subtotal)}
                    </span>
                  </div>
                ) : null}
                {g.items.map((e) => {
                  const t = e.head;
                  const place = t.institution_id ? institutionName[t.institution_id] : null;
                  const link = linkedName(e);
                  return (
                    <Card key={e.key} className="transition-transform active:scale-[0.99]">
                      <CardContent className="p-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 p-4 text-left"
                          onClick={() => setConfirm(e)}
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-semibold">
                              {place || t.description || "Transaction"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {(t.account_id && accountName[t.account_id]) || "No account"}
                              {t.category_id && categoryName[t.category_id]
                                ? ` · ${categoryName[t.category_id]}`
                                : ""}
                              {` · ${t.transaction_date}`}
                            </p>
                            {link ? (
                              <Badge variant="outline" className="mt-1">
                                {link}
                              </Badge>
                            ) : null}
                            {e.isSplit ? (
                              <Badge variant="secondary" className="mt-1 ml-1">
                                Split
                              </Badge>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(Math.abs(e.total))}
                          </span>
                        </button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark cleared?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? `${confirm.head.description || "This transaction"} · ${formatMoney(
                    Math.abs(confirm.total),
                  )}${
                    linkedName(confirm)
                      ? ` — this also credits ${linkedName(confirm)}'s cycle and rolls its due date.`
                      : ""
                  }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(ev) => {
                ev.preventDefault();
                if (confirm) void clearEntry(confirm);
              }}
            >
              {busy ? "Clearing…" : "Mark cleared"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
