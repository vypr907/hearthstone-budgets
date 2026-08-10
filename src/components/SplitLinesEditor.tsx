import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { Category } from "@/lib/supabase";

export const NO_SPLIT_CATEGORY = "__none__";

export type SplitRow = { categoryId: string; amount: string };

export function emptySplitRow(): SplitRow {
  return { categoryId: NO_SPLIT_CATEGORY, amount: "" };
}

export function splitRowsTotal(rows: SplitRow[]) {
  return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * ADR-044 repeatable {category, amount} editor shared by the Add Transaction
 * flow and the split edit view. Purely presentational — the caller owns state
 * and does the save.
 */
export function SplitLinesEditor({
  rows,
  categories,
  total,
  onChange,
}: {
  rows: SplitRow[];
  categories: Category[];
  /** The transaction total the lines must add up to. */
  total: number;
  onChange: (rows: SplitRow[]) => void;
}) {
  const sum = splitRowsTotal(rows);
  const diff = Math.round((total - sum) * 100) / 100;

  const update = (i: number, patch: Partial<SplitRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <Label>Split lines</Label>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={r.categoryId} onValueChange={(v) => update(i, { categoryId: v })}>
            <SelectTrigger className="h-11 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SPLIT_CATEGORY}>No category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            className="h-11 w-28"
            value={r.amount}
            onChange={(e) => update(i, { amount: e.target.value })}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Remove split line"
            className="h-11 w-11 shrink-0"
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => onChange([...rows, emptySplitRow()])}
      >
        <Plus className="mr-2 h-4 w-4" /> Add line
      </Button>
      <p
        className={`text-xs ${
          Math.abs(diff) < 0.005 ? "text-muted-foreground" : "text-destructive"
        }`}
      >
        Lines total {formatMoney(sum)} of {formatMoney(total)}
        {Math.abs(diff) < 0.005 ? " — matches." : ` · ${formatMoney(diff)} unallocated.`}
      </p>
    </div>
  );
}
