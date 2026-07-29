import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  useTransactions,
  useUpsertTransaction,
  useDeleteTransaction,
  useAccounts,
  useCategories,
  useBills,
  useDebts,
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
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Transaction } from "@/lib/supabase";
import { DetailGrid, DetailItem, DetailText } from "@/components/detail";

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
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("date");
  const [detail, setDetail] = useState<Transaction | null>(null);

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

  const rows = useMemo(() => {
    let out = transactions;
    if (account !== "all")
      out = out.filter((t) =>
        account === "none" ? !t.account_id : t.account_id === account,
      );
    if (status !== "all") out = out.filter((t) => t.status === status);
    return [...out].sort((a, b) => {
      if (sort === "amount") return Math.abs(Number(b.amount)) - Math.abs(Number(a.amount));
      return b.transaction_date.localeCompare(a.transaction_date);
    });
  }, [transactions, account, status, sort]);

  return (
    <>
      <AppHeader title="Transactions" />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger className="h-11">
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
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Sort: Date</SelectItem>
            <SelectItem value="amount">Sort: Amount</SelectItem>
          </SelectContent>
        </Select>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No transactions match.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {rows.map((t) => (
            <Card key={t.id} className="cursor-pointer" onClick={() => setDetail(t)}>
              <CardContent className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.description || "Transaction"}</p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{t.transaction_date}</span>
                    {t.account_id && accountName[t.account_id] ? (
                      <span>· {accountName[t.account_id]}</span>
                    ) : null}
                    {t.category_id && categoryName[t.category_id] ? (
                      <span>· {categoryName[t.category_id]}</span>
                    ) : null}
                    <Badge
                      variant={t.status === "cleared" ? "outline" : "secondary"}
                      className="capitalize"
                    >
                      {t.status || "pending"}
                    </Badge>
                  </div>
                </div>
                <p
                  className={`shrink-0 font-semibold ${Number(t.amount) < 0 ? "" : "text-primary"}`}
                >
                  {formatMoney(Number(t.amount))}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <TransactionDetail transaction={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function TransactionDetail({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const upsert = useUpsertTransaction();
  const del = useDeleteTransaction();

  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("pending");
  const [accountId, setAccountId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");

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
  }
  if (!transaction && lastKey !== "") setLastKey("");

  if (!transaction) return null;
  const linkedBill = bills.find((b) => b.id === transaction.linked_bill_id);
  const linkedDebt = debts.find((d) => d.id === transaction.linked_debt_id);
  const isLinked = !!(transaction.linked_bill_id || transaction.linked_debt_id);

  async function save() {
    try {
      await upsert.mutateAsync({
        id: transaction!.id,
        amount: Number(amount),
        description: description || null,
        transaction_date: date,
        status: status as "pending" | "cleared",
        account_id: accountId === "none" ? null : accountId,
        category_id: categoryId === "none" ? null : categoryId,
      });
      toast.success("Transaction updated");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete() {
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
          <DialogTitle>{transaction.description || "Transaction"}</DialogTitle>
        </DialogHeader>

        {!edit ? (
          <div className="space-y-4">
            <DetailGrid>
              <DetailItem label="Amount" value={formatMoney(Number(transaction.amount))} />
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
              <DetailItem
                label="Category"
                value={categories.find((c) => c.id === transaction.category_id)?.name ?? "—"}
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
