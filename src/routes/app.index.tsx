import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  monthKey,
  useAccounts,
  useBills,
  useCategories,
  useDebts,
  useLatestBalances,
  useSpendingActuals,
  useSpendingBudgets,
  useTransactions,
} from "@/lib/data-hooks";
import { formatMoney, isDateOverdue, dueDayToDate } from "@/lib/format";
import {
  accountTypeIs,
  computeBalances,
  creditOwed,
  isSpendableAccount,
} from "@/lib/balances";
import { buildActualResolver } from "@/lib/spending-actuals";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";


export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Hearthstone" },
      {
        name: "description",
        content:
          "Household budget dashboard with monthly obligations, income comparison, and overdue items in Hearthstone.",
      },
      { property: "og:title", content: "Dashboard — Hearthstone" },
      {
        property: "og:description",
        content:
          "Household budget dashboard with monthly obligations, income comparison, and overdue items in Hearthstone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { data: accounts = [] } = useAccounts();
  const { data: latest = {} } = useLatestBalances();
  const { data: transactions = [] } = useTransactions();
  const { data: budgets = [] } = useSpendingBudgets();
  const { data: actuals = [] } = useSpendingActuals();
  const { data: categories = [] } = useCategories();

  const balances = useMemo(
    () => computeBalances(accounts, latest, transactions),
    [accounts, latest, transactions],
  );

  /**
   * Spendable = only is_spendable checking/credit accounts. Savings,
   * investment and retirement are always excluded.
   */
  const spendable = useMemo(() => {
    let total = 0;
    let checking = 0;
    let availableCredit = 0;
    let savings = 0;
    for (const a of accounts) {
      const b = balances[a.id]?.spendable ?? 0;
      if (isSpendableAccount(a)) total += b;
      if (accountTypeIs(a, "checking")) checking += b;
      if (accountTypeIs(a, "credit"))
        availableCredit += Number(a.credit_limit ?? 0) - creditOwed(b);
      if (accountTypeIs(a, "savings")) savings += b;
    }
    return { total, checking, availableCredit, savings };
  }, [accounts, balances]);

  /** Budget vs actual for the current month, grouped by parent_category. */
  const budgetChart = useMemo(() => {
    const month = monthKey(new Date());
    const resolver = buildActualResolver(actuals, transactions);
    const byId: Record<string, (typeof categories)[number]> = {};
    for (const c of categories) byId[c.id] = c;
    const groups = new Map<string, { name: string; budgeted: number; actual: number }>();
    for (const b of budgets) {
      if (!b.category_id) continue;
      const parent = byId[b.category_id]?.parent_category?.trim() || "";
      const key = parent || "__none__";
      const g = groups.get(key) ?? { name: parent || "Ungrouped", budgeted: 0, actual: 0 };
      g.budgeted += Number(b.budgeted_amount || 0);
      g.actual += resolver.resolve(b.category_id, month).amount;
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budgets, actuals, transactions, categories]);



  const totalBills = bills
    .filter((b) => b.is_active !== false)
    .reduce((s, b) => s + Number(b.amount || 0), 0);
  const totalDebtPayments = debts.reduce(
    (s, d) => s + Number(d.minimum_payment || 0),
    0,
  );
  const totalObligations = totalBills + totalDebtPayments;

  const overdue = [
    ...bills
      .filter((b) => isDateOverdue(b.next_due_date, b.payment_status))
      .map((b) => ({
        id: `bill-${b.id}`,
        name: b.name,
        amount: Number(b.amount || 0),
        due_date: b.next_due_date!.slice(0, 10),
        kind: "Bill" as const,
      })),
    ...debts
      .filter((d) => isDateOverdue(dueDayToDate(d.due_day), d.payment_status))
      .map((d) => ({
        id: `debt-${d.id}`,
        name: d.name,
        amount: Number(d.minimum_payment || 0),
        due_date: dueDayToDate(d.due_day)!,
        kind: "Debt" as const,
      })),
  ].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <>
      <AppHeader title="Dashboard" />
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total monthly obligations
            </p>
            <p className="mt-1 text-3xl font-bold">{formatMoney(totalObligations)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Monthly bills</p>
                <p className="text-lg font-semibold">{formatMoney(totalBills)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Monthly debts</p>
                <p className="text-lg font-semibold">{formatMoney(totalDebtPayments)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold uppercase tracking-wide">Overdue</h2>
          </div>
          {overdue.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Nothing overdue. Nice.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {overdue.map((o) => (
                <Card key={o.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.kind} · due {o.due_date}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-destructive">
                      {formatMoney(o.amount)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
