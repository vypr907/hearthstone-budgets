import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { itemColor } from "@/components/viz";
import {
  useAccounts,
  useBills,
  useCategories,
  useEffectiveDebts,
  useInstitutions,
  useTransactions,
} from "@/lib/data-hooks";
import { billsDebtsPaidOnDay, dailySpendByCategory, dayMoneyInOut } from "@/lib/daily-financials";
import { addDaysISO, formatMoney } from "@/lib/format";
import { internalTransferIds, opaqueTransferAccountIds } from "@/lib/internal-transfers";
import { todayISO } from "@/lib/snapshot";
import { categoryVisual } from "@/lib/visual-meta";

export const Route = createFileRoute("/app/daily-financials")({
  head: () => ({
    meta: [
      { title: "Daily Financials — Hearthstone" },
      {
        name: "description",
        content: "Money in, money out, and what was paid on any single day.",
      },
      { property: "og:title", content: "Daily Financials — Hearthstone" },
      {
        property: "og:description",
        content: "Money in, money out, and what was paid on any single day.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DailyFinancialsPage,
});

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * ADR-108: day-scoped companion to the month/pay-period screens (Spending,
 * Monthly Summary, Paycheck Budget) — answers "what happened on this
 * specific day" instead of over a whole period.
 */
function DailyFinancialsPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: institutions = [] } = useInstitutions();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useEffectiveDebts();
  const [day, setDay] = useState(todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);

  // ADR-089/107: money moved between the household's own accounts isn't
  // spend (or income), even when a leg happens to carry a category/place.
  const internal = useMemo(
    () => internalTransferIds(transactions, opaqueTransferAccountIds(accounts)),
    [transactions, accounts],
  );

  const totals = useMemo(
    () => dayMoneyInOut(transactions, internal, day),
    [transactions, internal, day],
  );

  const categoryRows = useMemo(
    () => dailySpendByCategory(transactions, categories, institutions, internal, day),
    [transactions, categories, institutions, internal, day],
  );

  const paidItems = useMemo(
    () => billsDebtsPaidOnDay(transactions, bills, debts, day),
    [transactions, bills, debts, day],
  );

  return (
    <>
      <AppHeader title="Daily Financials" />
      <main className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Previous day"
                onClick={() => setDay(addDaysISO(day, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold"
                  >
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    {dayLabel(day)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={new Date(`${day}T00:00:00`)}
                    onSelect={(d) => {
                      if (!d) return;
                      const y = d.getFullYear();
                      const m = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      setDay(`${y}-${m}-${dd}`);
                      setPickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Next day"
                onClick={() => setDay(addDaysISO(day, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            {day !== todayISO() ? (
              <Button variant="outline" className="h-10 w-full" onClick={() => setDay(todayISO())}>
                Jump to today
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4 text-center">
            <div className="flex items-center justify-around">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Money in
                </p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.in)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Money out
                </p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(totals.out)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Net
              </p>
              <p
                className={`text-4xl font-extrabold tabular-nums ${
                  totals.net >= 0 ? "text-state-cleared" : "text-destructive"
                }`}
              >
                {formatMoney(totals.net)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionLabel>Spending by category</SectionLabel>
            {categoryRows.length === 0 ? (
              <EmptyState>No categorized spending logged this day.</EmptyState>
            ) : (
              categoryRows.map((row, index) => {
                const visual = categoryVisual(row.category);
                return (
                  <Collapsible key={row.categoryId}>
                    <CollapsibleTrigger className="flex w-full items-center gap-2 text-left">
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                        style={{ backgroundColor: `${visual.color}33` }}
                      >
                        {visual.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.category?.name ?? "Uncategorized"}
                      </span>
                      <span className="text-sm font-semibold">{formatMoney(row.total)}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1 pl-10">
                      {row.byInstitution.map((inst) => (
                        <div
                          key={inst.institutionId ?? "unknown"}
                          className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
                        >
                          <span className="min-w-0 truncate">
                            {inst.institution?.name ?? "Unknown place"}
                          </span>
                          <span className="shrink-0 tabular-nums">{formatMoney(inst.amount)}</span>
                        </div>
                      ))}
                    </CollapsibleContent>
                    {index < categoryRows.length - 1 ? (
                      <div className="mt-3 border-b border-border" />
                    ) : null}
                  </Collapsible>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionLabel>Paid today</SectionLabel>
            {paidItems.length === 0 ? (
              <EmptyState>Nothing paid this day.</EmptyState>
            ) : (
              paidItems.map((item, index) => {
                const category = categories.find((c) => c.id === item.categoryId);
                const visual = categoryVisual(category);
                return (
                  <div key={`${item.kind}-${item.id}`} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                      style={{ backgroundColor: `${itemColor(index)}33` }}
                    >
                      {visual.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(item.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
