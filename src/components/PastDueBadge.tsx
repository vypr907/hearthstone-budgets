import { Badge } from "@/components/ui/badge";
import { arrearsLabel, computeArrears } from "@/lib/arrears";
import { formatMoney } from "@/lib/format";
import type { Payable } from "@/lib/payments";

/**
 * ADR-049: "how far behind", not just "overdue". Renders nothing when the
 * payable is current, so it can be dropped into any list row.
 */
export function PastDueBadge({ payable }: { payable: Payable }) {
  const arrears = computeArrears(payable);
  const label = arrearsLabel(arrears, formatMoney);
  if (!label) return null;
  return (
    <Badge variant="destructive" title="Missed cycles plus any carried-in arrears">
      {label}
    </Badge>
  );
}
