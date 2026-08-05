import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";

export function statusVariant(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "secondary" as const;
    case "partial":
      return "destructive" as const;
    case "cleared":
      return "outline" as const;
    default:
      return "default" as const;
  }
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge variant={statusVariant(status)} className="capitalize">
      {status || "unpaid"}
    </Badge>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{children}</div>;
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

export function DetailMoney({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return <DetailItem label={label} value={value != null ? formatMoney(Number(value)) : "—"} />;
}

export function DetailText({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</p>
    </div>
  );
}
