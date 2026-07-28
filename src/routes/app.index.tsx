import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useBills, useDebts } from "@/lib/data-hooks";
import { formatMoney, isOverdue } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/")({
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
      .filter((b) => isOverdue(dueDayFromDate(b.next_due_date), b.payment_status))
      .map((b) => ({
        id: `bill-${b.id}`,
        name: b.name,
        amount: b.amount,
        due_day: dueDayFromDate(b.next_due_date),
        kind: "Bill" as const,
      })),
    ...debts
      .filter((d) => isOverdue(d.due_day, d.payment_status))
      .map((d) => ({
        id: `debt-${d.id}`,
        name: d.name,
        amount: d.minimum_payment,
        due_day: d.due_day,
        kind: "Debt" as const,
      })),
  ];

  return (
    <>
      <AppHeader title="Dashboard" />
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Monthly obligations
            </p>
            <p className="mt-1 text-3xl font-bold">{formatMoney(totalObligations)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Bills</p>
                <p className="text-lg font-semibold">{formatMoney(totalBills)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Debt payments</p>
                <p className="text-lg font-semibold">{formatMoney(totalDebtPayments)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Income vs obligations</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Log transactions with a positive amount as income; the ledger will drive
              this view. For now, planned obligations total{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(totalObligations)}
              </span>{" "}
              per month.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">Outflow</span>
              <span className="ml-auto font-semibold">{formatMoney(totalObligations)}</span>
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
                        {o.kind} · due day {o.due_day}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-destructive">
                      {formatMoney(Number(o.amount))}
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
