import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { categoryVisual, formatTypeLabel } from "@/lib/visual-meta";
import { InstitutionLogo } from "@/components/InstitutionLogo";


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
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
      {children}
    </div>
  );
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words font-medium">{value}</div>
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
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words whitespace-pre-wrap text-sm">{value || "—"}</p>
    </div>
  );
}


/** Category shown as a colour chip (60% opacity) with its emoji. */
export function CategoryChip({
  category,
}: {
  category?: { name?: string | null; icon?: string | null; color?: string | null } | null;
}) {
  if (!category) return <span>—</span>;
  const v = categoryVisual(category);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${v.color}99`, color: "var(--foreground)" }}
    >
      <span aria-hidden>{v.icon}</span>
      <span className="truncate">{category.name ?? "Category"}</span>
    </span>
  );
}

/** Neutral capitalized chip — billing cycle, manual/auto, and similar enums. */
export function ValueChip({ value }: { value: string | null | undefined }) {
  const s = (value ?? "").trim();
  if (!s) return <span>—</span>;
  return (
    <Badge variant="secondary" className="font-medium">
      {formatTypeLabel(s)}
    </Badge>
  );
}

/** Institution / account name with its logo in front. */
export function LogoLabel({
  name,
  logoUrl,
  type,
}: {
  name?: string | null;
  logoUrl?: string | null;
  type?: string | null;
}) {
  if (!name) return <span>—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <InstitutionLogo logoUrl={logoUrl} type={type} size={20} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Money value with extra visual weight — used for the "Total owed" rollup. */
export function DetailMoneyStrong({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="break-words text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-xl font-bold tracking-tight">
        {value != null ? formatMoney(Number(value)) : "—"}
      </div>
    </div>
  );
}
