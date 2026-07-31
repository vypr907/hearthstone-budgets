import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useDebts,
  useDebtStrategySettings,
  useScheduleCheckoffs,
  useToggleScheduleCheckoff,
} from "@/lib/data-hooks";
import { activeDebts, type StrategyKey } from "@/lib/debt-payoff";
import { buildSchedule } from "@/lib/payment-schedule";
import { formatMoney } from "@/lib/format";
import { CheckCircle2, Circle } from "lucide-react";

export const Route = createFileRoute("/app/payment-schedule")({
  head: () => ({
    meta: [
      { title: "Payment Schedule — Hearthstone" },
      {
        name: "description",
        content:
          "See which debts get paid and how much for each of the next 12 months, and check off months once the payments are made.",
      },
      { property: "og:title", content: "Payment Schedule — Hearthstone" },
      {
        property: "og:description",
        content:
          "A 12-month household debt payment plan built from your active payoff strategy and extra payment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentSchedulePage,
});

function PaymentSchedulePage() {
  const { data: debts = [] } = useDebts();
  const { data: settings } = useDebtStrategySettings();
  const { data: checked = [] } = useScheduleCheckoffs();
  const toggle = useToggleScheduleCheckoff();

  const strategy = ((): StrategyKey => {
    const s = (settings?.active_strategy ?? "avalanche").toLowerCase();
    return s === "snowball" || s === "custom" ? s : "avalanche";
  })();
  const extra = Number(settings?.extra_monthly_payment ?? 0);

  const plan = useMemo(() => activeDebts(debts), [debts]);
  const schedule = useMemo(
    () => buildSchedule(plan, extra, strategy, 12),
    [plan, extra, strategy],
  );

  const done = new Set(checked);

  const onToggle = async (month: string) => {
    try {
      await toggle.mutateAsync({ month, done: !done.has(month) });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <AppHeader title="Payment Schedule" />
      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active strategy</span>
              <span className="font-medium capitalize">{strategy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extra monthly payment</span>
              <span className="font-medium">{formatMoney(extra)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Months checked off</span>
              <span className="font-medium">{done.size}</span>
            </div>
          </CardContent>
        </Card>

        {plan.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No active debts with a remaining balance yet.
            </CardContent>
          </Card>
        ) : (
          schedule.map((m) => {
            const isDone = done.has(m.month);
            return (
              <Card key={m.month} className={isDone ? "opacity-70" : undefined}>
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 border-b p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{m.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.payments.length} payment{m.payments.length === 1 ? "" : "s"} ·{" "}
                        {formatMoney(m.total)}
                      </p>
                    </div>
                    <Button
                      variant={isDone ? "default" : "outline"}
                      size="sm"
                      className="h-11 shrink-0 gap-2"
                      disabled={toggle.isPending}
                      onClick={() => onToggle(m.month)}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                      {isDone ? "Paid" : "Mark paid"}
                    </Button>
                  </div>
                  <div className="divide-y">
                    {m.payments.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">
                        Nothing scheduled — all debts paid off.
                      </p>
                    ) : (
                      m.payments.map((p) => (
                        <div
                          key={p.debtId}
                          className="flex items-center gap-3 px-4 py-3 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          {p.payoff && <Badge variant="secondary">Paid off</Badge>}
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="block font-medium">
                              {formatMoney(p.amount)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {formatMoney(p.remaining)} left
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
