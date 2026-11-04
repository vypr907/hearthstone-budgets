import { useState } from "react";
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
import { Trash2, Plus, MapPin, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatMoney } from "@/lib/format";
import { TagPicker } from "@/components/TagPicker";
import { PlacePicker } from "@/components/PlacePicker";
import { useInstitutions } from "@/lib/data-hooks";
import type { Category } from "@/lib/supabase";

export const NO_SPLIT_CATEGORY = "__none__";

/** ADR-104: tagIds — which tags apply to this one line specifically. A null
 *  `institutionId` falls back to the entry's own shared place at save time
 *  (see `insertCashBackPurchaseRows`/`useSaveSplitTransaction`), same
 *  fallback convention `submitTransfer`'s fee leg already uses. */
export type SplitRow = {
  categoryId: string;
  amount: string;
  tagIds: string[];
  institutionId: string | null;
};

export function emptySplitRow(): SplitRow {
  return { categoryId: NO_SPLIT_CATEGORY, amount: "", tagIds: [], institutionId: null };
}

export function splitRowsTotal(rows: SplitRow[]) {
  return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

/**
 * Same compact-trigger-opens-a-Popover shape `TagPicker`'s `compact` mode
 * already uses — `PlacePicker` itself is a block-level search/suggest UI
 * (full-width input + inline suggestion chips), never built for a tight
 * inline row, so it's floated in a Popover here rather than rendered inline.
 */
function CompactPlacePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (institutionId: string | null) => void;
}) {
  const { data: institutions = [] } = useInstitutions();
  const [open, setOpen] = useState(false);
  const selected = institutions.find((i) => i.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 justify-between gap-1 px-2"
        >
          <MapPin className="h-4 w-4 shrink-0 opacity-70" />
          {selected ? (
            <span className="max-w-[72px] truncate text-xs">{selected.name}</span>
          ) : null}
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <PlacePicker
          compact
          value={value}
          onChange={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
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
        <div key={i} className="space-y-1.5 rounded-md border border-border/50 p-2">
          <div className="flex items-center gap-2">
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
              className="h-11 w-24"
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
          <div className="flex items-center gap-2">
            <TagPicker
              compact
              tagIds={r.tagIds}
              onChange={(tagIds) => update(i, { tagIds })}
            />
            <CompactPlacePicker
              value={r.institutionId}
              onChange={(institutionId) => update(i, { institutionId })}
            />
          </div>
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
