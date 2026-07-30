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
