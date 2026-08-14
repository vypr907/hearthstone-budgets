import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { PlacePicker } from "@/components/PlacePicker";
import { EmptyState } from "@/components/EmptyState";
import { useAccounts, useTransactions, useUpsertTransaction } from "@/lib/data-hooks";
import { accountLabel, formatMoney } from "@/lib/format";
import type { Transaction } from "@/lib/supabase";

export const Route = createFileRoute("/app/fix-places")({
  head: () => ({
    meta: [
      { title: "Fix Places — Hearthstone" },
      {
        name: "description",
        content:
          "Assign a place to household transactions that were saved without one, so spending by place stays accurate.",
      },
      { property: "og:title", content: "Fix Places — Hearthstone" },
      {
        property: "og:description",
        content:
          "Assign a place to household transactions that were saved without one, so spending by place stays accurate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FixPlacesPage,
});

/**
 * ADR-053/063 repair scan: transactions written before merchants existed (or
 * saved in a hurry) have no institution_id, so they never show up in Spending
 * by Place. Same visual pattern as the ADR-037 stranded-payment repair card.
 */
function FixPlacesPage() {
  const { data: transactions = [] } = useTransactions();
  const { data: accounts = [] } = useAccounts();
  const save = useUpsertTransaction();

  const accountName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = accountLabel(a);
    return m;
  }, [accounts]);

  const unassigned = useMemo(
    () => transactions.filter((t: Transaction) => !t.institution_id),
    [transactions],
  );

  async function assign(t: Transaction, institutionId: string | null) {
    if (!institutionId) return;
    try {
      await save.mutateAsync({ id: t.id, amount: Number(t.amount), institution_id: institutionId });
      toast.success("Place assigned");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Fix Places" />
      <div className="space-y-3 p-4">
        {unassigned.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Every transaction has a place
              </div>
              <EmptyState>Nothing to fix right now.</EmptyState>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-amber-500/40">
              <CardContent className="flex items-start gap-2 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <p className="font-semibold">
                    {unassigned.length} transaction{unassigned.length === 1 ? "" : "s"} without a
                    place
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assign a place so this spending shows up under Spending by Place. You can search
                    existing places or add a new one inline.
                  </p>
                </div>
              </CardContent>
            </Card>

            {unassigned.map((t) => (
              <Card key={t.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {t.description || "(no description)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.transaction_date}
                        {t.account_id && accountName[t.account_id]
                          ? ` · ${accountName[t.account_id]}`
                          : ""}
                        {t.status ? ` · ${t.status}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(Math.abs(Number(t.amount ?? 0)))}
                    </span>
                  </div>
                  <PlacePicker
                    value={null}
                    onChange={(id) => void assign(t, id)}
                    compact
                    label="Place"
                  />
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
