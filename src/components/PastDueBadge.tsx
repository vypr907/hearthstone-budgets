import { Badge } from "@/components/ui/badge";
import { priorArrearsLabel, priorArrearsSummary } from "@/lib/arrears";
import { formatMoney } from "@/lib/format";
import type { Payable } from "@/lib/payments";

/**
 * ADR-049: "how far behind", not just "overdue". ADR-049 addendum: the badge
 * shows arrears from cycles before the current month only — the current cycle
 * shows separately as "due this period" (ADR-080), so folding it in here would
 * double-count. Renders nothing when the payable has no prior-month arrears, so
 * it can be dropped into any list row.
 */
export function PastDueBadge({ payable }: { payable: Payable }) {
  const summary = priorArrearsSummary(payable);
  const label = priorArrearsLabel(summary, formatMoney);
  if (!label) return null;
  return (
    <Badge variant="destructive" title="Missed cycles from before this month, plus any carried-in arrears">
      {label}
    </Badge>
  );
}
