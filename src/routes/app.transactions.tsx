import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { TransactionTitle } from "@/components/TransactionTitle";
import {
  useTransactions,
  useUpsertTransaction,
  useDeleteTransaction,
  useDeleteTransferPair,
  useAccounts,
  useCategories,
  useBills,
  useDebts,
  useInstitutions,
  useSaveSplitTransaction,
  useDeleteSplitTransaction,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Transaction } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailText } from "@/components/detail";
import { groupLedgerRows } from "@/lib/split-groups";
import {
  SplitLinesEditor,
  emptySplitRow,
  splitRowsTotal,
  NO_SPLIT_CATEGORY,
  type SplitRow,
} from "@/components/SplitLinesEditor";
import { consumeTxPreFilter } from "@/lib/tx-filter-store";

export const Route = createFileRoute("/app/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Hearthstone" },
      {
        name: "description",
        content:
          "Browse the household ledger of pending and cleared transactions by account, status, date, and amount.",
      },
      { property: "og:title", content: "Transactions — Hearthstone" },
      {
        property: "og:description",
        content:
          "Browse the household ledger of pending and cleared transactions by account, status, date, and amount.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { data: transactions = [], isLoading } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();

  // --- Filter state ---
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("date");
  const [groupBy, setGroupBy] = useState("none");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [placeFilter, setPlaceFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState("all"); // all | linked | unlinked
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  /** ADR-053/063: search matches free-text description or the resolved place. */
  const [searchQuery, setSearchQuery] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterLabel, setFilterLabel] = useState<string | null>(null);

  const [detail, setDetail] = useState<Transaction | null>(null);

  // Consume any pre-filter set by spending drill-down.
  useEffect(() => {
    const pre = consumeTxPreFilter();
    if (!pre) return;
    if (pre.categoryId) {
      setCategoryFilter(pre.categoryId);
      setFiltersOpen(true);
    }
    if (pre.label) setFilterLabel(pre.label);
  }, []);

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

  const rows = useMemo(() => {
    let out = transactions;
    if (account !== "all")
      out = out.filter((t) =>
        account === "none" ? !t.account_id : t.account_id === account,
      );
    if (status !== "all") out = out.filter((t) => t.status === status);
    if (categoryFilter !== "all")
      out = out.filter((t) =>
        categoryFilter === "none" ? !t.category_id : t.category_id === categoryFilter,
      );
    if (placeFilter !== "all")
      out = out.filter((t) =>
        placeFilter === "none" ? !t.institution_id : t.institution_id === placeFilter,
      );
    if (linkedFilter === "linked")
      out = out.filter(
        (t) => t.linked_bill_id || t.linked_debt_id || t.linked_goal_id,
      );
    if (linkedFilter === "unlinked")
      out = out.filter(
        (t) => !t.linked_bill_id && !t.linked_debt_id && !t.linked_goal_id,
      );
    if (dateFrom) out = out.filter((t) => t.transaction_date >= dateFrom);
    if (dateTo) out = out.filter((t) => t.transaction_date <= dateTo);
    const q = searchQuery.trim().toLowerCase();
    if (q)
      out = out.filter((t) => {
        const place = (t.institution_id && institutionName[t.institution_id]) || "";
        return (
          (t.description ?? "").toLowerCase().includes(q) ||
          place.toLowerCase().includes(q)
        );
      });
    if (amountMin.trim())
      out = out.filter((t) => Math.abs(Number(t.amount)) >= Number(amountMin));
    if (amountMax.trim())
      out = out.filter((t) => Math.abs(Number(t.amount)) <= Number(amountMax));
    return [...out].sort((a, b) => {
      if (sort === "amount") return Math.abs(Number(b.amount)) - Math.abs(Number(a.amount));
      if (sort === "name")
        return (a.description ?? "").localeCompare(b.description ?? "");
      return b.transaction_date.localeCompare(a.transaction_date);
    });
  }, [
    transactions,
    account,
    status,
    sort,
    categoryFilter,
    placeFilter,
    linkedFilter,
    dateFrom,
    dateTo,
    searchQuery,
    amountMin,
    amountMax,
    institutionName,
  ]);

  /** ADR-044: collapse split lines into one entry per real transaction. */
  const entries = useMemo(() => groupLedgerRows(rows), [rows]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Group entries for display
  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ label: "", items: entries }];
    const buckets = new Map<string, typeof entries>();
    for (const entry of entries) {
      const t = entry.head;
      let key = "";
      if (groupBy === "day") key = t.transaction_date.slice(0, 10);
      else if (groupBy === "category")
        key = (t.category_id && categoryName[t.category_id]) || "Uncategorized";
      else if (groupBy === "account")
        key = (t.account_id && accountName[t.account_id]) || "No account";
      else if (groupBy === "place")
        key = (t.institution_id && institutionName[t.institution_id]) || "No place";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(entry);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items }));
  }, [entries, groupBy, categoryName, accountName, institutionName]);

  const activeFilterCount = [
    account !== "all",
    status !== "all",
    categoryFilter !== "all",
    placeFilter !== "all",
    linkedFilter !== "all",
    !!dateFrom,
    !!dateTo,
    !!searchQuery.trim(),
    !!amountMin.trim(),
    !!amountMax.trim(),
  ].filter(Boolean).length;

  function clearFilters() {
    setAccount("all");
    setStatus("all");
    setCategoryFilter("all");
    setPlaceFilter("all");
    setLinkedFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setAmountMin("");
    setAmountMax("");
    setFilterLabel(null);
  }

  return (
    <>
      <AppHeader title="Transactions" />
      <div className="space-y-3 p-4">
        {/* Free-text search over description and place */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Search description or place…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Primary sort + group controls */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Sort: Date</SelectItem>
              <SelectItem value="amount">Sort: Amount</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="day">Group: Day</SelectItem>
              <SelectItem value="category">Group: Category</SelectItem>
              <SelectItem value="account">Group: Account</SelectItem>
              <SelectItem value="place">Group: Place</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Collapsible filter panel */}
        <div className="rounded-md border">
          <button
            type="button"
            className="flex w-full items-center justify-between p-3 text-sm font-medium"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span>
              Filters
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              ) : null}
              {filterLabel ? (
                <span className="ml-2 text-xs text-muted-foreground">({filterLabel})</span>
              ) : null}
            </span>
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {filtersOpen ? (
            <div className="space-y-2 border-t p-3">
              <div className="grid grid-cols-2 gap-2">
                <Select value={account} onValueChange={setAccount}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    <SelectItem value="none">No account</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={placeFilter} onValueChange={setPlaceFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All places</SelectItem>
                    <SelectItem value="none">No place</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={linkedFilter} onValueChange={setLinkedFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Linked + unlinked</SelectItem>
                  <SelectItem value="linked">Linked to bill/debt/goal</SelectItem>
                  <SelectItem value="unlinked">Unlinked only</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">From date</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="text-xs">To date</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Amount from</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div>
                  <Label className="text-xs">Amount to</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="0.00"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="sm" className="h-9 w-full" onClick={clearFilters}>
                  Clear all filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && entries.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No transactions match.
            </CardContent>
          </Card>
        )}

        {grouped.map(({ label, items }) => (
          <div key={label || "all"} className="space-y-2">
            {label ? (
              <SectionLabel className="px-1 pt-1">{label}</SectionLabel>
            ) : null}
            {items.map((entry) => {
              const t = entry.head;
              return (
                <Card
                  key={entry.key}
                  className="cursor-pointer"
                  onClick={() => setDetail(t)}
                >
                  <CardContent className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <TransactionTitle
                          transaction={t}
                          placeName={t.institution_id ? institutionName[t.institution_id] : null}
                        />
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{t.transaction_date}</span>
                        {t.account_id && accountName[t.account_id] ? (
                          <span>· {accountName[t.account_id]}</span>
                        ) : null}
                        {!entry.isSplit && t.category_id && categoryName[t.category_id] ? (
                          <span>· {categoryName[t.category_id]}</span>
                        ) : null}
                        {t.institution_id && institutionName[t.institution_id] ? (
                          <span>· 🏪 {institutionName[t.institution_id]}</span>
                        ) : null}
                        {entry.isSplit ? (
                          <Badge variant="secondary">
                            Split · {entry.rows.length} categories
                          </Badge>
                        ) : null}
                        {t.transfer_group_id ? (
                          <Badge variant="outline">Transfer</Badge>
                        ) : null}
                        <Badge
                          variant={t.status === "cleared" ? "outline" : "secondary"}
                          className="capitalize"
                        >
                          {t.status || "pending"}
                        </Badge>
                      </div>
                      {entry.isSplit ? (
                        <button
                          className="mt-1 text-xs text-muted-foreground underline decoration-dotted"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => ({
                              ...prev,
                              [entry.key]: !prev[entry.key],
                            }));
                          }}
                        >
                          {expanded[entry.key] ? "Hide breakdown" : "Show breakdown"}
                        </button>
                      ) : null}
                      {entry.isSplit && expanded[entry.key] ? (
                        <div className="mt-1 divide-y divide-border/50 rounded-md border">
                          {entry.rows.map((line) => (
                            <div
                              key={line.id}
                              className="flex items-center justify-between px-2 py-1 text-xs"
                            >
                              <span className="truncate">
                                {(line.category_id && categoryName[line.category_id]) ||
                                  "No category"}
                              </span>
                              <span className="tabular-nums">
                                {formatMoney(Number(line.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <p
                      className={`shrink-0 font-semibold ${entry.total < 0 ? "" : "text-primary"}`}
                    >
                      {formatMoney(entry.total)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      <TransactionDetail transaction={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export function TransactionDetail({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: allTransactions = [] } = useTransactions();
  const upsert = useUpsertTransaction();
  const del = useDeleteTransaction();
  const delTransferPair = useDeleteTransferPair();

  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [accountId, setAccountId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");
  // ADR-053: place/institution re-tag (Group 7 Part 3)
  const [institutionId, setInstitutionId] = useState("none");

  const key = transaction?.id ?? "";
  const [lastKey, setLastKey] = useState("");
  if (transaction && key !== lastKey) {
    setLastKey(key);
    setEdit(false);
    setAmount(String(transaction.amount));
    setDescription(transaction.description ?? "");
    setDate(transaction.transaction_date.slice(0, 10));
    setStatus(transaction.status ?? "pending");
    setAccountId(transaction.account_id ?? "none");
    setCategoryId(transaction.category_id ?? "none");
    setInstitutionId(transaction.institution_id ?? "none");
  }
  if (!transaction && lastKey !== "") setLastKey("");

  if (!transaction) return null;
  // ADR-044: a split entry is edited as a whole group, never line by line.
  if (transaction.split_group_id)
    return <SplitTransactionDetail transaction={transaction} onClose={onClose} />;

  const linkedBill = bills.find((b) => b.id === transaction.linked_bill_id);
  const linkedDebt = debts.find((d) => d.id === transaction.linked_debt_id);
  const isLinked = !!(transaction.linked_bill_id || transaction.linked_debt_id);
  const placeName = institutions.find((i) => i.id === transaction.institution_id)?.name ?? null;
  // ADR-056: a transfer is two rows sharing transfer_group_id — negative on
  // the from-account, positive on the to-account. Find the other leg to show
  // both sides instead of just this row's own account.
  const transferPair = transaction.transfer_group_id
    ? allTransactions.find(
        (t) => t.transfer_group_id === transaction.transfer_group_id && t.id !== transaction.id,
      )
    : null;
  const accountName = (id: string | null | undefined) =>
    accounts.find((a) => a.id === id)?.name ?? "—";
  const transferFromAccount = transferPair
    ? Number(transaction.amount) < 0
      ? accountName(transaction.account_id)
      : accountName(transferPair.account_id)
    : null;
  const transferToAccount = transferPair
    ? Number(transaction.amount) < 0
      ? accountName(transferPair.account_id)
      : accountName(transaction.account_id)
    : null;

  async function save() {
    try {
      await upsert.mutateAsync({
        id: transaction!.id,
        // ADR-037 addendum: the amount field is disabled while linked, so this
        // is always the untouched original value — sent through unconditionally
        // to satisfy the mutation's required `amount`.
        amount: Number(amount),
        // Status on a linked row must go through applyClearedPayment (Pay
        // actions / Reverse) so bills/debts stay in sync — editing it here
        // would silently strand cycle_paid_to_date.
        ...(isLinked ? {} : { status: status as "pending" | "cleared" }),
        description: description || null,
        transaction_date: date,
        account_id: accountId === "none" ? null : accountId,
        category_id: categoryId === "none" ? null : categoryId,
        institution_id: institutionId === "none" ? null : institutionId,
      });
      toast.success("Transaction updated");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    // ADR-056: if this row is one side of a transfer, delete both sides.
    if (transaction!.transfer_group_id) {
      if (!confirm("Delete this transfer? Both the from and to transactions will be removed.")) return;
      try {
        await delTransferPair.mutateAsync(transaction!.transfer_group_id);
        toast.success("Transfer deleted");
        onClose();
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }
    if (!confirm("Delete this transaction?")) return;
    try {
      await del.mutateAsync(transaction!);
      toast.success("Transaction deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <TransactionTitle transaction={transaction} placeName={placeName} />
          </DialogTitle>
        </DialogHeader>

        {!edit ? (
          <div className="space-y-4">
            <DetailGrid>
              <DetailItem label="Amount" value={formatMoney(Number(transaction.amount))} />
              <DetailItem label="Date" value={transaction.transaction_date} />
              <DetailItem
                label="Status"
                value={
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={transaction.status === "cleared" ? "outline" : "secondary"}
                      className="capitalize"
                    >
                      {transaction.status || "pending"}
                    </Badge>
                    {transaction.transfer_group_id ? (
                      <Badge variant="outline">Transfer</Badge>
                    ) : null}
                  </div>
                }
              />
              {transferPair ? (
                <>
                  <DetailItem label="From" value={transferFromAccount} />
                  <DetailItem label="To" value={transferToAccount} />
                </>
              ) : (
                <DetailItem
                  label="Account"
                  value={accounts.find((a) => a.id === transaction.account_id)?.name ?? "—"}
                />
              )}
              <DetailItem
                label="Category"
                value={categories.find((c) => c.id === transaction.category_id)?.name ?? "—"}
              />
              <DetailItem
                label="Place"
                value={institutions.find((i) => i.id === transaction.institution_id)?.name ?? "—"}
              />
              <DetailItem
                label="Linked to"
                value={linkedBill?.name ?? linkedDebt?.name ?? "—"}
              />
            </DetailGrid>
            <DetailText label="Description" value={transaction.description} />
            {isLinked && (
              <p className="text-xs text-muted-foreground">
                This transaction is linked to a {linkedBill ? "bill" : "debt"}; it can't be
                deleted so the ledger stays in sync with its payment status.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {isLinked && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Amount and status are locked on linked entries — use{" "}
                {linkedBill ? "the bill's" : "the debt's"} Pay actions (or Reverse) so{" "}
                {linkedBill?.name ?? linkedDebt?.name} stays in sync.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11"
                  disabled={isLinked}
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
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={isLinked}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="cleared">cleared</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            {/* ADR-053: re-tag or set the place this transaction occurred at */}
            <div>
              <Label>Place (institution)</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="No place" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No place</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!isLinked ? (
            <Button variant="destructive" className="h-11" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          {edit ? (
            <Button className="h-11" onClick={save} disabled={upsert.isPending}>
              Save
            </Button>
          ) : (
            <Button className="h-11" onClick={() => setEdit(true)}>
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ADR-044: view/edit every line of one split transaction together. Saving
 * replaces the whole group (delete + re-insert) instead of patching lines.
 */
function SplitTransactionDetail({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const { data: transactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const saveSplit = useSaveSplitTransaction();
  const delSplit = useDeleteSplitTransaction();

  const groupId = transaction.split_group_id!;
  const lines = useMemo(
    () => transactions.filter((t) => t.split_group_id === groupId),
    [transactions, groupId],
  );
  const total = lines.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const sign = total < 0 ? -1 : 1;

  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState<SplitRow[]>([emptySplitRow()]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("cleared");
  const [accountId, setAccountId] = useState("");

  const [lastKey, setLastKey] = useState("");
  if (groupId !== lastKey) {
    setLastKey(groupId);
    setEdit(false);
    setDescription(transaction.description ?? "");
    setDate(transaction.transaction_date.slice(0, 10));
    setStatus(transaction.status ?? "cleared");
    setAccountId(transaction.account_id ?? "");
    setRows(
      lines.map((l) => ({
        categoryId: l.category_id ?? NO_SPLIT_CATEGORY,
        amount: String(Math.abs(Number(l.amount ?? 0))),
      })),
    );
  }

  const editedTotal = splitRowsTotal(rows);

  async function save() {
    const kept = rows.filter((r) => Number(r.amount));
    if (kept.length < 1) {
      toast.error("Add at least one line");
      return;
    }
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    try {
      await saveSplit.mutateAsync({
        splitGroupId: groupId,
        accountId,
        transactionDate: date,
        description: description || null,
        status: status as "pending" | "cleared",
        lines: kept.map((r) => ({
          categoryId: r.categoryId === NO_SPLIT_CATEGORY ? null : r.categoryId,
          amount: sign * Math.abs(Number(r.amount)),
        })),
      });
      // A group edited down to one line is no longer a split (bug fix: this
      // also repairs fee-less payments that were wrongly tagged as 1-line
      // splits before payments.ts stopped stamping split_group_id on them).
      toast.success(kept.length === 1 ? "Transaction updated" : "Split transaction updated");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this split transaction and all its lines?")) return;
    try {
      await delSplit.mutateAsync(groupId);
      toast.success("Split transaction deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{transaction.description || "Split transaction"}</DialogTitle>
        </DialogHeader>

        {!edit ? (
          <div className="space-y-4">
            <DetailGrid>
              <DetailItem label="Total" value={formatMoney(total)} />
              <DetailItem label="Date" value={transaction.transaction_date} />
              <DetailItem
                label="Status"
                value={
                  <Badge
                    variant={transaction.status === "cleared" ? "outline" : "secondary"}
                    className="capitalize"
                  >
                    {transaction.status || "pending"}
                  </Badge>
                }
              />
              <DetailItem
                label="Account"
                value={accounts.find((a) => a.id === transaction.account_id)?.name ?? "—"}
              />
            </DetailGrid>
            <div>
              <SectionLabel>Category lines</SectionLabel>
              <div className="mt-1 divide-y divide-border/50 rounded-md border">
                {lines.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between px-2 py-2 text-sm"
                  >
                    <span className="truncate">
                      {categories.find((c) => c.id === l.category_id)?.name ??
                        "No category"}
                    </span>
                    <span className="tabular-nums">{formatMoney(Number(l.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
            <DetailText label="Description" value={transaction.description} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="cleared">cleared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                      {a.name}
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
            <SplitLinesEditor
              rows={rows}
              categories={categories}
              total={editedTotal}
              onChange={setRows}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" className="h-11" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
          {edit ? (
            <Button className="h-11" onClick={save} disabled={saveSplit.isPending}>
              Save
            </Button>
          ) : (
            <Button className="h-11" onClick={() => setEdit(true)}>
              Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
