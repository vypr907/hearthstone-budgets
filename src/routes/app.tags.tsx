import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Plus } from "lucide-react";
import { useTransactions } from "@/lib/data-hooks";
import { useTags, useTransactionTags } from "@/lib/tags";
import { TagDialog } from "@/components/TagDialog";
import { formatMoney } from "@/lib/format";
import { tagVisual } from "@/lib/visual-meta";
import { setTxPreFilter } from "@/lib/tx-filter-store";
import type { Tag } from "@/lib/supabase";

export const Route = createFileRoute("/app/tags")({
  head: () => ({
    meta: [
      { title: "Tags — Hearthstone" },
      {
        name: "description",
        content:
          "Label transactions (or one line of a split) with a free-form tag and see totals across everything tagged.",
      },
      { property: "og:title", content: "Tags — Hearthstone" },
      {
        property: "og:description",
        content:
          "Label transactions (or one line of a split) with a free-form tag and see totals across everything tagged.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TagsPage,
});

function TagsPage() {
  const navigate = useNavigate();
  const { data: tags = [], isLoading } = useTags();
  const { data: transactions = [] } = useTransactions();
  const { data: txTags = {} } = useTransactionTags();
  const [editing, setEditing] = useState<Partial<Tag> | null>(null);

  // ADR-104: totals/counts computed client-side — one pass over transactions,
  // bucketed by every tag id each row carries (a row can count toward more
  // than one tag's total, same as a wedding-tagged AND tax-deductible-tagged
  // line would).
  const totals = useMemo(() => {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    const out = new Map<string, { total: number; count: number }>();
    for (const tag of tags) out.set(tag.id, { total: 0, count: 0 });
    for (const [txId, ids] of Object.entries(txTags)) {
      const t = byId.get(txId);
      if (!t) continue;
      for (const tagId of ids) {
        const row = out.get(tagId);
        if (!row) continue;
        row.total += Number(t.amount || 0);
        row.count += 1;
      }
    }
    return out;
  }, [tags, transactions, txTags]);

  function drillInto(tag: Tag) {
    setTxPreFilter({ tagId: tag.id, label: tag.name });
    void navigate({ to: "/app/transactions" });
  }

  return (
    <>
      <AppHeader title="Tags" />
      <div className="space-y-3 p-4">
        <Button className="h-12 w-full text-base" onClick={() => setEditing({})}>
          <Plus className="mr-2 h-5 w-5" /> Add tag
        </Button>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && tags.length === 0 && (
          <Card>
            <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
              <p>No tags yet.</p>
              <p>
                Tags label a transaction — or just one line of a split — for anything that
                cuts across categories: an event, a trip, tax-deductible spend, medical
                expenses. Add one and apply it from any transaction's edit view.
              </p>
            </CardContent>
          </Card>
        )}

        {tags.length > 0 && (
          <Card>
            <CardContent className="divide-y divide-border/50 p-0">
              {tags.map((t) => {
                const v = tagVisual(t);
                const row = totals.get(t.id) ?? { total: 0, count: 0 };
                return (
                  <div
                    key={t.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-3"
                    onClick={() => drillInto(t)}
                  >
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-lg"
                      style={{ background: `${v.color}22` }}
                    >
                      {v.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.count} transaction{row.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="tabular-nums text-sm font-semibold">
                      {formatMoney(row.total)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(t);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <TagDialog tag={editing} onClose={() => setEditing(null)} />
    </>
  );
}
