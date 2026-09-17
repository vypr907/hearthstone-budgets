import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { TransactionTitle } from "@/components/TransactionTitle";
import {
  useTransactions,
  useUpsertTransaction,
  useDeleteTransaction,
  useDeleteTransferPair,
  useSetTransferFee,
  useAccounts,
  useCategories,
  useBills,
  useDebts,
  useInstitutions,
  useSaveSplitTransaction,
  useDeleteSplitTransaction,
} from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";
import { todayISO } from "@/lib/snapshot";
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
import {
  groupLedgerRows,
  classifyLedgerGroup,
  isCategorySplitGroup,
  isPaymentWithFeesGroup,
} from "@/lib/split-groups";
import { useIncomeEvents } from "@/lib/income-hooks";
import {
  SplitLinesEditor,
  emptySplitRow,
  splitRowsTotal,
  NO_SPLIT_CATEGORY,
  type SplitRow,
} from "@/components/SplitLinesEditor";
import { consumeTxPreFilter } from "@/lib/tx-filter-store";
import { internalTransferIds, isInternalTransfer } from "@/lib/internal-transfers";
import { ReversePaymentButton } from "@/components/ReversePaymentButton";
import { useEditLinkedTransaction, toPayable } from "@/lib/payments";
import { useTags, useTransactionTags, useSetTransactionTags } from "@/lib/tags";
import { TagPicker } from "@/components/TagPicker";
import { tagVisual } from "@/lib/visual-meta";


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
  const { data: incomeEvents = [] } = useIncomeEvents();
  const { data: tags = [] } = useTags();
  const { data: txTags = {} } = useTransactionTags();
  // ADR-047 addendum: a split_group_id that IS an income_events.id is a
  // paycheck deposit group, not an ADR-044 category split.
  const incomeEventIds = useMemo(
    () => new Set(incomeEvents.map((e) => e.id)),
    [incomeEvents],
  );

  // --- Filter state ---
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("date");
  const [groupBy, setGroupBy] = useState("none");
  const [categoryFilter, setCategoryFilter] = useState("all");
  /** Multi-category drill-down from a parent-category tile (no UI control). */
  const [categoryIds, setCategoryIds] = useState<string[] | null>(null);
  const [placeFilter, setPlaceFilter] = useState("all");
  /** ADR-104: "all" | "none" | a tag id. */
  const [tagFilter, setTagFilter] = useState("all");
  const [linkedFilter, setLinkedFilter] = useState("all"); // all | linked | unlinked
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  /** ADR-089: drill-downs from budget figures hide two-sided transfers. */
  const [hideInternalTransfers, setHideInternalTransfers] = useState(false);
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
    if (pre.categoryIds?.length) {
      setCategoryIds(pre.categoryIds);
      setFiltersOpen(true);
    }
    if (pre.linked) setLinkedFilter(pre.linked);
    if (pre.dateFrom) setDateFrom(pre.dateFrom);
    if (pre.dateTo) setDateTo(pre.dateTo);
    if (pre.excludeInternalTransfers) setHideInternalTransfers(true);
    if (pre.tagId) {
      setTagFilter(pre.tagId);
      setFiltersOpen(true);
    }
    if (pre.institutionId) {
      setPlaceFilter(pre.institutionId);
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
  // ADR-098: resolve each transfer leg's own "<Source> -> <Destination>"
  // pair once, keyed by transaction id, instead of a per-row find().
  const transferTitleAccounts = useMemo(() => {
    const legsByGroup: Record<string, Transaction[]> = {};
    for (const t of transactions) {
      if (!t.transfer_group_id) continue;
      (legsByGroup[t.transfer_group_id] ||= []).push(t);
    }
    const m: Record<string, { from: string; to: string }> = {};
    for (const legs of Object.values(legsByGroup)) {
      const from = legs.find((l) => Number(l.amount) < 0);
      const to = legs.find((l) => Number(l.amount) >= 0);
      if (!from || !to) continue;
      const pair = {
        from: accountName[from.account_id ?? ""] ?? "—",
        to: accountName[to.account_id ?? ""] ?? "—",
      };
      for (const l of legs) m[l.id] = pair;
    }
    return m;
  }, [transactions, accountName]);

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
    if (categoryIds?.length)
      out = out.filter((t) => !!t.category_id && categoryIds.includes(t.category_id));
    if (placeFilter !== "all")
      out = out.filter((t) =>
        placeFilter === "none" ? !t.institution_id : t.institution_id === placeFilter,
      );
    if (tagFilter !== "all")
      out = out.filter((t) =>
        tagFilter === "none"
          ? !(txTags[t.id]?.length)
          : (txTags[t.id] ?? []).includes(tagFilter),
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
    // ADR-089: mirror the budget math — two-sided transfers aren't spending.
    if (hideInternalTransfers) {
      const internal = internalTransferIds(transactions);
      out = out.filter((t) => !isInternalTransfer(t, internal));
    }
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
    categoryIds,
    placeFilter,
    tagFilter,
    txTags,
    linkedFilter,
    dateFrom,
    dateTo,
    hideInternalTransfers,
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
    tagFilter !== "all",
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
    setCategoryIds(null);
    setPlaceFilter("all");
    setTagFilter("all");
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
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    <SelectItem value="none">No tags</SelectItem>
                    {tags.map((tg) => (
                      <SelectItem key={tg.id} value={tg.id}>
                        {tagVisual(tg).icon} {tg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
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
              // ADR-047 addendum: only a genuine category split opens the
              // whole-group editor; a paycheck / multi-account group opens its
              // per-row breakdown so a single deposit can be corrected.
              const kind = entry.isSplit
                ? classifyLedgerGroup(entry.rows, entry.key, incomeEventIds)
                : null;
              const perRow = kind === "paycheck" || kind === "linked-or-multi";
              const splitBadge =
                kind === "paycheck"
                  ? `Paycheck · ${entry.rows.length} deposit${entry.rows.length === 1 ? "" : "s"}`
                  : kind === "linked-or-multi"
                    ? `Split · ${entry.rows.length} rows`
                    : `Split · ${entry.rows.length} categories`;
              return (
                <Card
                  key={entry.key}
                  className="cursor-pointer"
                  onClick={() =>
                    perRow
                      ? setExpanded((prev) => ({ ...prev, [entry.key]: true }))
                      : setDetail(t)
                  }
                >
                  <CardContent className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <TransactionTitle
                          transaction={t}
                          placeName={t.institution_id ? institutionName[t.institution_id] : null}
                          transferFromAccount={transferTitleAccounts[t.id]?.from}
                          transferToAccount={transferTitleAccounts[t.id]?.to}
                        />
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{t.transaction_date}</span>
                        {/* ADR-100: only worth a second date when it's set and differs. */}
                        {t.cleared_date && t.cleared_date !== t.transaction_date ? (
                          <span>· cleared {t.cleared_date}</span>
                        ) : null}
                        {!perRow && t.account_id && accountName[t.account_id] ? (
                          <span>· {accountName[t.account_id]}</span>
                        ) : null}
                        {!entry.isSplit && t.category_id && categoryName[t.category_id] ? (
                          <span>· {categoryName[t.category_id]}</span>
                        ) : null}
                        {t.institution_id && institutionName[t.institution_id] ? (
                          <span>· 🏪 {institutionName[t.institution_id]}</span>
                        ) : null}
                        {(() => {
                          // ADR-104: union of tags across the group's lines — a
                          // split can carry different tags per line.
                          const ids = [
                            ...new Set(entry.rows.flatMap((r) => txTags[r.id] ?? [])),
                          ];
                          if (ids.length === 0) return null;
                          return (
                            <span className="flex flex-wrap gap-1">
                              {ids.map((id) => {
                                const tg = tags.find((x) => x.id === id);
                                if (!tg) return null;
                                const v = tagVisual(tg);
                                return (
                                  <Badge key={id} variant="outline" className="gap-0.5">
                                    {v.icon} {tg.name}
                                  </Badge>
                                );
                              })}
                            </span>
                          );
                        })()}
                        {entry.isSplit ? (
                          <Badge variant="secondary">{splitBadge}</Badge>
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
                          {expanded[entry.key]
                            ? "Hide breakdown"
                            : perRow
                              ? "Show breakdown (tap a line to edit)"
                              : "Show breakdown"}

                        </button>
                      ) : null}
                      {entry.isSplit && expanded[entry.key] ? (
                        <div className="mt-1 divide-y divide-border/50 rounded-md border">
                          {entry.rows.map((line) => {
                            const label = perRow
                              ? line.description ||
                                (line.account_id && accountName[line.account_id]) ||
                                "Deposit"
                              : (line.category_id && categoryName[line.category_id]) ||
                                "No category";
                            const inner = (
                              <>
                                <span className="truncate text-left">{label}</span>
                                <span className="tabular-nums">
                                  {formatMoney(Number(line.amount))}
                                </span>
                              </>
                            );
                            return perRow ? (
                              <button
                                key={line.id}
                                className="flex w-full items-center justify-between px-2 py-1.5 text-xs hover:bg-muted/50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetail(line);
                                }}
                              >
                                {inner}
                              </button>
                            ) : (
                              <div
                                key={line.id}
                                className="flex items-center justify-between px-2 py-1 text-xs"
                              >
                                {inner}
                              </div>
                            );
                          })}
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

      <TransactionDetail
        transaction={detail}
        onClose={() => setDetail(null)}
        onOpenTransaction={setDetail}
      />
    </>
  );
}

export function TransactionDetail({
  transaction,
  onClose,
  onOpenTransaction,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  /** Opens another transaction's own detail view in place of this one — used
   *  by the transfer-fee reverse link below. */
  onOpenTransaction?: (t: Transaction) => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: allTransactions = [] } = useTransactions();
  const { data: incomeEvents = [] } = useIncomeEvents();
  const upsert = useUpsertTransaction();
  const del = useDeleteTransaction();
  const delTransferPair = useDeleteTransferPair();
  const setTransferFee = useSetTransferFee();
  const editLinked = useEditLinkedTransaction();
  const { data: tags = [] } = useTags();
  const { data: txTags = {} } = useTransactionTags();
  const setTxTags = useSetTransactionTags();


  const incomeEventIds = useMemo(
    () => new Set(incomeEvents.map((e) => e.id)),
    [incomeEvents],
  );
  // ADR-103: transfer_group_ids in play, so a Cash Back purchase group (a
  // split_group_id that IS some transfer's transfer_group_id) is never
  // mistaken for a genuine category split.
  const transferGroupIds = useMemo(
    () =>
      new Set(
        allTransactions
          .map((t) => t.transfer_group_id)
          .filter((g): g is string => !!g),
      ),
    [allTransactions],
  );
  const groupRows = useMemo(
    () =>
      transaction?.split_group_id
        ? allTransactions.filter((t) => t.split_group_id === transaction.split_group_id)
        : [],
    [allTransactions, transaction?.split_group_id],
  );
  // ADR-097: a transfer's optional fee, found by the transfer's own group id
  // living in the fee row's split_group_id (never transfer_group_id itself).
  const transferFeeRow = useMemo(
    () =>
      transaction?.transfer_group_id
        ? (allTransactions.find((t) => t.split_group_id === transaction.transfer_group_id) ?? null)
        : null,
    [allTransactions, transaction?.transfer_group_id],
  );

  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("pending");
  // ADR-100: the date this actually cleared — only meaningful (and shown)
  // when status is "cleared". Seeded from the row's own cleared_date, or
  // today when the edit flips status from pending to cleared.
  const [clearedDate, setClearedDate] = useState("");
  const [accountId, setAccountId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");
  // ADR-053: place/institution re-tag (Group 7 Part 3)
  const [institutionId, setInstitutionId] = useState("none");
  // ADR-097: blank means "no fee" — prefilled from any existing paired fee row.
  const [feeInput, setFeeInput] = useState("");
  // ADR-104
  const [tagIds, setTagIds] = useState<string[]>([]);

  const key = transaction?.id ?? "";
  const [lastKey, setLastKey] = useState("");
  if (transaction && key !== lastKey) {
    setLastKey(key);
    setEdit(false);
    setAmount(String(transaction.amount));
    setDescription(transaction.description ?? "");
    setDate(transaction.transaction_date.slice(0, 10));
    setStatus(transaction.status ?? "pending");
    setClearedDate(transaction.cleared_date?.slice(0, 10) ?? todayISO());
    setAccountId(transaction.account_id ?? "none");
    setCategoryId(transaction.category_id ?? "none");
    setInstitutionId(transaction.institution_id ?? "none");
    setFeeInput(transferFeeRow ? String(Math.abs(Number(transferFeeRow.amount))) : "");
    setTagIds(txTags[transaction.id] ?? []);
  }
  if (!transaction && lastKey !== "") setLastKey("");

  if (!transaction) return null;
  // ADR-044 / ADR-047 addendum: the whole-group editor is only safe for a
  // genuine category split (one account, N category lines, not a paycheck).
  // A paycheck / deduction / multi-account group is edited one row at a time
  // through the normal single-row path below.
  // ADR-097: require > 1 row — a split_group_id shared by no other row (e.g.
  // a solo transfer fee) isn't a real split and falls through to the plain
  // single-transaction editor below instead.
  if (
    transaction.split_group_id &&
    groupRows.length > 1 &&
    isCategorySplitGroup(groupRows, transaction.split_group_id, incomeEventIds, transferGroupIds)
  )
    return <SplitTransactionDetail transaction={transaction} onClose={onClose} />;
  // ADR-091: a payment + fee group (one linked row, one account) gets its own
  // grouped editor — the linked line stays in sync with the bill/debt while
  // the plain fee lines can be edited, added or removed.
  if (
    transaction.split_group_id &&
    groupRows.length > 1 &&
    !incomeEventIds.has(transaction.split_group_id) &&
    isPaymentWithFeesGroup(groupRows)
  )
    return (
      <LinkedGroupDetail
        groupId={transaction.split_group_id}
        rows={groupRows}
        onClose={onClose}
      />
    );


  // ADR-097: same > 1 guard as above — a solo split_group_id row is not a
  // paycheck deposit either.
  const isPaycheckDeposit =
    !!transaction.split_group_id &&
    groupRows.length > 1 &&
    !isCategorySplitGroup(groupRows, transaction.split_group_id, incomeEventIds, transferGroupIds);
  const depositAccountCount = isPaycheckDeposit
    ? new Set(groupRows.map((r) => r.account_id ?? null)).size
    : 0;

  const linkedBill = bills.find((b) => b.id === transaction.linked_bill_id);
  const linkedDebt = debts.find((d) => d.id === transaction.linked_debt_id);
  const isLinked = !!(transaction.linked_bill_id || transaction.linked_debt_id);
  // ADR-077/ADR-070: let a linked payment be corrected or reversed straight from
  // the ledger instead of dead-ending on "fix it from the bill/debt screen".
  const linkedPayable = linkedBill
    ? toPayable("bill", linkedBill)
    : linkedDebt
      ? toPayable("debt", linkedDebt)
      : null;
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
  // ADR-097: the fee always debits the from-account, regardless of which leg
  // this detail view happens to be open on.
  const transferFromAccountId = transferPair
    ? Number(transaction.amount) < 0
      ? transaction.account_id
      : transferPair.account_id
    : null;
  const transferFromAccountInstitutionId = transferFromAccountId
    ? (accounts.find((a) => a.id === transferFromAccountId)?.institution_id ?? null)
    : null;
  // ADR-097 addendum: the reverse of transferFeeRow above — opening a
  // transfer's fee row directly (not via its parent transfer leg) had no way
  // back. A fee row's split_group_id equals its transfer's transfer_group_id,
  // so look up either leg of that transfer the same way.
  const linkedTransferLeg =
    !transferPair && transaction.split_group_id
      ? (allTransactions.find((t) => t.transfer_group_id === transaction.split_group_id) ?? null)
      : null;
  const linkedTransferOtherLeg =
    linkedTransferLeg && linkedTransferLeg.transfer_group_id
      ? (allTransactions.find(
          (t) =>
            t.transfer_group_id === linkedTransferLeg.transfer_group_id &&
            t.id !== linkedTransferLeg.id,
        ) ?? null)
      : null;
  const linkedTransferFromAccount = linkedTransferLeg
    ? Number(linkedTransferLeg.amount) < 0
      ? accountName(linkedTransferLeg.account_id)
      : accountName(linkedTransferOtherLeg?.account_id)
    : null;
  const linkedTransferToAccount = linkedTransferLeg
    ? Number(linkedTransferLeg.amount) < 0
      ? accountName(linkedTransferOtherLeg?.account_id)
      : accountName(linkedTransferLeg.account_id)
    : null;

  async function save() {
    try {
      // ADR-091: a linked row is edited through the payable-aware path — the
      // bill/debt is rolled back and re-applied so its balance, cycle counters
      // and status match the edited payment.
      if (isLinked && linkedPayable) {
        await editLinked.mutateAsync({
          transaction: transaction!,
          kind: linkedPayable.kind,
          payableId: linkedPayable.id,
          amount: Math.abs(Number(amount)),
          date,
          status: status as "pending" | "cleared",
          clearedDate: status === "cleared" ? clearedDate || todayISO() : null,
          accountId: accountId === "none" ? null : accountId,
          categoryId: categoryId === "none" ? null : categoryId,
          institutionId: institutionId === "none" ? null : institutionId,
          description: description || null,
        });
        await setTxTags.mutateAsync({ transactionId: transaction!.id, tagIds });
        toast.success(`Transaction updated — ${linkedPayable.name} kept in sync`);
        onClose();
        return;
      }
      await upsert.mutateAsync({
        id: transaction!.id,
        amount: Number(amount),
        status: status as "pending" | "cleared",
        description: description || null,
        transaction_date: date,
        cleared_date: status === "cleared" ? clearedDate || todayISO() : null,
        account_id: accountId === "none" ? null : accountId,
        category_id: categoryId === "none" ? null : categoryId,
        institution_id: institutionId === "none" ? null : institutionId,
      });
      // ADR-097: sync the transfer's paired fee (add/change/remove) alongside
      // this leg's own edit — independent of which leg is currently open.
      if (transaction!.transfer_group_id && transferFromAccountId) {
        await setTransferFee.mutateAsync({
          transferGroupId: transaction!.transfer_group_id,
          fromAccountId: transferFromAccountId,
          existingFee: transferFeeRow,
          fee: feeInput ? Number(feeInput) : undefined,
          label: description.trim() || "Transfer",
          institutionId: transferFromAccountInstitutionId,
          date,
        });
      }
      await setTxTags.mutateAsync({ transactionId: transaction!.id, tagIds });
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
    const msg = isPaycheckDeposit
      ? "Delete this row? The other rows in this grouped entry are not affected."
      : "Delete this transaction?";
    if (!confirm(msg)) return;
    try {
      await del.mutateAsync(transaction!);
      toast.success("Transaction deleted");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** ADR-047 addendum: shown on a paycheck deposit row so it's clear that
   *  editing here touches only this one deposit. */
  const paycheckBanner =
    isPaycheckDeposit && !isLinked ? (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {`Part of a grouped entry — ${groupRows.length} row${
          groupRows.length === 1 ? "" : "s"
        } across ${depositAccountCount} account${
          depositAccountCount === 1 ? "" : "s"
        }. Editing here changes only this row.`}
      </p>
    ) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <TransactionTitle
              transaction={transaction}
              placeName={placeName}
              transferFromAccount={transferFromAccount}
              transferToAccount={transferToAccount}
            />
          </DialogTitle>
        </DialogHeader>

        {!edit ? (
          <div className="space-y-4">
            {paycheckBanner}
            <DetailGrid>
              <DetailItem label="Amount" value={formatMoney(Number(transaction.amount))} />
              <DetailItem label="Date" value={transaction.transaction_date} />
              {transaction.status === "cleared" && (
                <DetailItem label="Cleared date" value={transaction.cleared_date ?? "—"} />
              )}
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
                  <DetailItem
                    label="Fee"
                    value={
                      transferFeeRow
                        ? formatMoney(Math.abs(Number(transferFeeRow.amount)))
                        : "None"
                    }
                  />
                </>
              ) : (
                <DetailItem
                  label="Account"
                  value={accounts.find((a) => a.id === transaction.account_id)?.name ?? "—"}
                />
              )}
              {linkedTransferLeg && (
                <DetailItem
                  label="Transfer"
                  value={
                    onOpenTransaction ? (
                      <button
                        type="button"
                        className="text-left underline decoration-dotted underline-offset-2"
                        onClick={() => onOpenTransaction(linkedTransferLeg)}
                      >
                        {linkedTransferFromAccount} → {linkedTransferToAccount}
                      </button>
                    ) : (
                      `${linkedTransferFromAccount} → ${linkedTransferToAccount}`
                    )
                  }
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
                label="Tags"
                value={
                  tagIds.length === 0 ? (
                    "—"
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {tagIds.map((id) => {
                        const t = tags.find((tg) => tg.id === id);
                        if (!t) return null;
                        const v = tagVisual(t);
                        return (
                          <Badge key={id} variant="outline" style={{ borderColor: v.color }}>
                            {v.icon} {t.name}
                          </Badge>
                        );
                      })}
                    </div>
                  )
                }
              />
              <DetailItem
                label="Linked to"
                value={linkedBill?.name ?? linkedDebt?.name ?? "—"}
              />
            </DetailGrid>
            <DetailText label="Description" value={transaction.description} />
            {isLinked && linkedPayable && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Linked to {linkedPayable.name}. Editing this payment also updates the{" "}
                {linkedPayable.kind}'s balance, cycle progress and status.
              </p>
            )}

          </div>
        ) : (
          <div className="space-y-3">
            {paycheckBanner}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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
            {transferPair ? (
              <div>
                <Label htmlFor="tx-transfer-fee">Fee (optional)</Label>
                <Input
                  id="tx-transfer-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="h-11"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Debited from {transferFromAccount} on top of the transfer amount. Clear
                  this field to remove the fee.
                </p>
              </div>
            ) : null}
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
            {status === "cleared" && (
              <div>
                <Label>Cleared date</Label>
                <Input
                  type="date"
                  value={clearedDate}
                  onChange={(e) => setClearedDate(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
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
            {/* ADR-047 addendum: paycheck deposit rows carry no category or
                place by design — hide the controls so a stray tag can't be
                added while correcting an amount. ADR-097: gated on
                isPaycheckDeposit specifically (not "has a split_group_id"),
                since a solo transfer-fee row also carries a split_group_id
                but does have — and needs to keep — its own category. */}
            {!isPaycheckDeposit && (
              <>
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
                <div>
                  <Label>Tags</Label>
                  <TagPicker tagIds={tagIds} onChange={setTagIds} />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {!isLinked ? (
            <Button variant="destructive" className="h-11" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : linkedPayable ? (
            /* ADR-091: Reverse is the undo for a linked payment — Delete would
               strand the bill/debt's cycle counters. */
            <div className="flex items-center gap-1">
              <ReversePaymentButton transaction={transaction} payable={linkedPayable} />
              <span className="text-xs text-muted-foreground">Reverse</span>
            </div>
          ) : (
            <span />
          )}
          {edit ? (
            <Button
              className="h-11"
              onClick={save}
              disabled={upsert.isPending || editLinked.isPending}
            >
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
  const { data: txTags = {} } = useTransactionTags();
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
  // ADR-100: shared by every line of the group, same as `date`.
  const [clearedDate, setClearedDate] = useState("");
  const [accountId, setAccountId] = useState("");

  const [lastKey, setLastKey] = useState("");
  if (groupId !== lastKey) {
    setLastKey(groupId);
    setEdit(false);
    setDescription(transaction.description ?? "");
    setDate(transaction.transaction_date.slice(0, 10));
    setStatus(transaction.status ?? "cleared");
    setClearedDate(transaction.cleared_date?.slice(0, 10) ?? todayISO());
    setAccountId(transaction.account_id ?? "");
    setRows(
      lines.map((l) => ({
        categoryId: l.category_id ?? NO_SPLIT_CATEGORY,
        amount: String(Math.abs(Number(l.amount ?? 0))),
        // ADR-104: seed each line's current tags from its own transaction id
        // — required, since saveSplit deletes + re-inserts every line on
        // save, so whatever isn't carried forward here is lost.
        tagIds: txTags[l.id] ?? [],
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
        clearedDate: status === "cleared" ? clearedDate || todayISO() : undefined,
        description: description || null,
        status: status as "pending" | "cleared",
        lines: kept.map((r) => ({
          categoryId: r.categoryId === NO_SPLIT_CATEGORY ? null : r.categoryId,
          amount: sign * Math.abs(Number(r.amount)),
          tagIds: r.tagIds,
        })),
        institutionId: transaction.institution_id,
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
              {transaction.status === "cleared" && (
                <DetailItem label="Cleared date" value={transaction.cleared_date ?? "—"} />
              )}
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
            {status === "cleared" && (
              <div>
                <Label>Cleared date</Label>
                <Input
                  type="date"
                  value={clearedDate}
                  onChange={(e) => setClearedDate(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
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

/**
 * ADR-091: edit a payment + fee group (ADR-046) as one unit — exactly one
 * bill/debt-linked payment line plus any number of plain fee/charge lines on
 * the same account. The linked line goes through the payable-aware edit so the
 * bill/debt stays in sync; the fee lines are patched, added or removed
 * directly. Never deletes and re-inserts the linked row.
 */
function LinkedGroupDetail({
  groupId,
  rows,
  onClose,
}: {
  groupId: string;
  rows: Transaction[];
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const upsert = useUpsertTransaction();
  const del = useDeleteTransaction();
  const editLinked = useEditLinkedTransaction();

  const linkedRow = rows.find((r) => r.linked_bill_id || r.linked_debt_id)!;
  const feeRows = useMemo(() => rows.filter((r) => r.id !== linkedRow.id), [rows, linkedRow.id]);
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const sign = Number(linkedRow.amount ?? 0) < 0 ? -1 : 1;

  const linkedBill = bills.find((b) => b.id === linkedRow.linked_bill_id);
  const linkedDebt = debts.find((d) => d.id === linkedRow.linked_debt_id);
  const payable = linkedBill
    ? toPayable("bill", linkedBill)
    : linkedDebt
      ? toPayable("debt", linkedDebt)
      : null;

  type FeeLine = { id: string | null; categoryId: string; amount: string; description: string };

  const [edit, setEdit] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("cleared");
  // ADR-100: shared by the payment line and every fee line, same as `date`.
  const [clearedDate, setClearedDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FeeLine[]>([]);
  const [removed, setRemoved] = useState<Transaction[]>([]);

  const [lastKey, setLastKey] = useState("");
  if (groupId !== lastKey) {
    setLastKey(groupId);
    setEdit(false);
    setPayAmount(String(Math.abs(Number(linkedRow.amount ?? 0))));
    setDate(linkedRow.transaction_date.slice(0, 10));
    setStatus(linkedRow.status ?? "cleared");
    setClearedDate(linkedRow.cleared_date?.slice(0, 10) ?? todayISO());
    setAccountId(linkedRow.account_id ?? "");
    setDescription(linkedRow.description ?? "");
    setRemoved([]);
    setLines(
      feeRows.map((r) => ({
        id: r.id,
        categoryId: r.category_id ?? NO_SPLIT_CATEGORY,
        amount: String(Math.abs(Number(r.amount ?? 0))),
        description: r.description ?? "",
      })),
    );
  }

  const editedTotal =
    sign *
    (Math.abs(Number(payAmount) || 0) +
      lines.reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0));

  const categoryName = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? "No category";

  async function save() {
    if (!accountId) {
      toast.error("Pick an account");
      return;
    }
    if (!payable) {
      toast.error("This payment's bill or debt is missing.");
      return;
    }
    try {
      const effectiveClearedDate = status === "cleared" ? clearedDate || todayISO() : null;
      await editLinked.mutateAsync({
        transaction: linkedRow,
        kind: payable.kind,
        payableId: payable.id,
        amount: Math.abs(Number(payAmount)),
        date,
        status: status as "pending" | "cleared",
        clearedDate: effectiveClearedDate,
        accountId,
        description: description || null,
      });
      for (const line of lines) {
        const value = Math.abs(Number(line.amount) || 0);
        if (!(value > 0.005)) continue;
        await upsert.mutateAsync({
          ...(line.id ? { id: line.id } : {}),
          amount: sign * value,
          status: status as "pending" | "cleared",
          transaction_date: date,
          cleared_date: effectiveClearedDate,
          account_id: accountId,
          category_id: line.categoryId === NO_SPLIT_CATEGORY ? null : line.categoryId,
          description: line.description || `Fee: ${payable.name}`,
          split_group_id: groupId,
          institution_id: linkedRow.institution_id,
        });
      }
      // Lines cleared to zero count as removals too.
      const zeroed = lines.filter(
        (l) => l.id && !(Math.abs(Number(l.amount) || 0) > 0.005),
      );
      for (const t of [...removed, ...feeRows.filter((r) => zeroed.some((z) => z.id === r.id))]) {
        await del.mutateAsync(t);
      }
      toast.success(`Transaction updated — ${payable.name} kept in sync`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{linkedRow.description || payable?.name || "Payment"}</DialogTitle>
        </DialogHeader>

        {!edit ? (
          <div className="space-y-4">
            <DetailGrid>
              <DetailItem label="Total" value={formatMoney(total)} />
              <DetailItem label="Date" value={linkedRow.transaction_date} />
              {linkedRow.status === "cleared" && (
                <DetailItem label="Cleared date" value={linkedRow.cleared_date ?? "—"} />
              )}
              <DetailItem
                label="Status"
                value={
                  <Badge
                    variant={linkedRow.status === "cleared" ? "outline" : "secondary"}
                    className="capitalize"
                  >
                    {linkedRow.status || "pending"}
                  </Badge>
                }
              />
              <DetailItem
                label="Account"
                value={accounts.find((a) => a.id === linkedRow.account_id)?.name ?? "—"}
              />
              <DetailItem label="Linked to" value={payable?.name ?? "—"} />
            </DetailGrid>
            <div>
              <SectionLabel>Lines</SectionLabel>
              <div className="mt-1 divide-y divide-border/50 rounded-md border">
                {rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-2 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {r.id === linkedRow.id
                        ? `Payment · ${payable?.name ?? ""}`
                        : r.description || categoryName(r.category_id)}
                    </span>
                    <span className="tabular-nums">{formatMoney(Number(r.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
            {payable && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Editing here updates the payment and its fees together — {payable.name}'s
                balance, cycle progress and status follow along.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            {status === "cleared" && (
              <div>
                <Label>Cleared date</Label>
                <Input
                  type="date"
                  value={clearedDate}
                  onChange={(e) => setClearedDate(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label>Fees and extra lines</Label>
              {lines.map((l, i) => (
                <div key={l.id ?? `new-${i}`} className="flex items-center gap-2">
                  <Select
                    value={l.categoryId}
                    onValueChange={(v) =>
                      setLines(lines.map((x, idx) => (idx === i ? { ...x, categoryId: v } : x)))
                    }
                  >
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SPLIT_CATEGORY}>No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-11 w-28"
                    value={l.amount}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove line"
                    className="h-11 w-11 shrink-0"
                    onClick={() => {
                      const existing = feeRows.find((r) => r.id === l.id);
                      if (existing) setRemoved((prev) => [...prev, existing]);
                      setLines(lines.filter((_, idx) => idx !== i));
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() =>
                  setLines([
                    ...lines,
                    { id: null, categoryId: NO_SPLIT_CATEGORY, amount: "", description: "" },
                  ])
                }
              >
                Add line
              </Button>
              <p className="text-xs text-muted-foreground">
                Group total {formatMoney(editedTotal)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {payable ? (
            <div className="flex items-center gap-1">
              <ReversePaymentButton transaction={linkedRow} payable={payable} />
              <span className="text-xs text-muted-foreground">Reverse</span>
            </div>
          ) : (
            <span />
          )}
          {edit ? (
            <Button
              className="h-11"
              onClick={save}
              disabled={editLinked.isPending || upsert.isPending}
            >
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
