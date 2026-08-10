import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { itemColor } from "@/components/viz";
import { useInstitutions, useTransactions } from "@/lib/data-hooks";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/spending-by-place")({
  head: () => ({
    meta: [
      { title: "Spending by Place — Hearthstone" },
      {
        name: "description",
        content:
          "See which stores, restaurants, and providers your household money goes to each month.",
      },
      { property: "og:title", content: "Spending by Place — Hearthstone" },
      {
        property: "og:description",
        content:
          "See which stores, restaurants, and providers your household money goes to each month.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpendingByPlacePage,
});

function currentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * ADR-053: transactions carry the place they happened at, so spending can be
 * ranked by merchant the same way it is ranked by category.
 */
function SpendingByPlacePage() {
  const { data: transactions = [] } = useTransactions();
  const { data: institutions = [] } = useInstitutions();
  const [month, setMonth] = useState(currentMonth());

  const rows = useMemo(() => {
    const byPlace = new Map<string, number>();
    for (const t of transactions) {
      if (!t.institution_id) continue;
      if (!(t.transaction_date ?? "").startsWith(month)) continue;
      // Money out only — deposits and refunds aren't spending.
      const spent = -Number(t.amount ?? 0);
      if (spent <= 0) continue;
      byPlace.set(t.institution_id, (byPlace.get(t.institution_id) ?? 0) + spent);
    }
    const list = [...byPlace.entries()].map(([id, amount]) => ({
      id,
      amount,
      institution: institutions.find((i) => i.id === id) ?? null,
    }));
    return list.sort((a, b) => b.amount - a.amount);
  }, [transactions, institutions, month]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const untagged = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            !t.institution_id &&
            (t.transaction_date ?? "").startsWith(month) &&
            -Number(t.amount ?? 0) > 0,
        )
        .reduce((sum, t) => sum + -Number(t.amount ?? 0), 0),
    [transactions, month],
  );

  return (
    <>
      <AppHeader title="Spending by place" />
      <main className="mx-auto max-w-lg space-y-4 p-4 pb-28">
        <Link
          to="/app/spending"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Spending
        </Link>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-center">
                <p className="text-sm font-semibold">{monthLabel(month)}</p>
                <p className="text-2xl font-bold">{formatMoney(total)}</p>
                <p className="text-xs text-muted-foreground">at {rows.length} places</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Next month"
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            {month !== currentMonth() ? (
              <Button
                variant="outline"
                className="h-10 w-full"
                onClick={() => setMonth(currentMonth())}
              >
                Jump to this month
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionLabel>Where the money went</SectionLabel>
            {rows.length === 0 ? (
              <EmptyState>
                No tagged spending this month. Pick or add a place when you log a
                transaction and it will show up here.
              </EmptyState>
            ) : (
              rows.map((r, index) => {
                const share = total > 0 ? (r.amount / total) * 100 : 0;
                const color = itemColor(index);
                return (
                  <div key={r.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      {r.institution?.logo_url ? (
                        <img
                          src={r.institution.logo_url}
                          alt=""
                          className="h-7 w-7 rounded-full object-contain"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                          style={{ backgroundColor: `${color}33` }}
                        >
                          🏪
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {r.institution?.name ?? "Unknown place"}
                      </span>
                      <span className="text-sm font-semibold">{formatMoney(r.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(2, share)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-muted-foreground">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            {untagged > 0.005 ? (
              <p className="pt-1 text-xs text-muted-foreground">
                {formatMoney(untagged)} of spending this month has no place attached.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
