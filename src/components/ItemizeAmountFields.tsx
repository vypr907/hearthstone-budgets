import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newItemizedAmountLine, type ItemizedAmountLine } from "@/lib/payments";

/**
 * ADR-046 addendum: the "+ Itemize this amount" control shared by Submit
 * Payment, Log a Payment on a debt, and Log a Payment on a bill. Renders
 * either a single toggle link (not itemizing) or the repeatable label+amount
 * rows (itemizing) — the caller owns the `items` state and decides what the
 * derived total feeds into (there is no transaction written per row; see
 * `composeItemizedDescription`/`itemizedAmountTotal`).
 */
export function ItemizeAmountFields({
  items,
  onChange,
}: {
  items: ItemizedAmountLine[];
  onChange: (items: ItemizedAmountLine[]) => void;
}) {
  if (items.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-0 text-xs text-muted-foreground"
        onClick={() => onChange([newItemizedAmountLine(), newItemizedAmountLine()])}
      >
        + Itemize this amount
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center gap-2">
          <Input
            placeholder="Label (e.g. Tax)"
            className="h-10 min-w-0 flex-1"
            value={it.label}
            onChange={(e) =>
              onChange(items.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))
            }
          />
          <Input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            className="h-10 w-24"
            value={it.amount}
            onChange={(e) =>
              onChange(items.map((x, xi) => (xi === i ? { ...x, amount: e.target.value } : x)))
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Remove row"
            onClick={() => onChange(items.filter((_, xi) => xi !== i))}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => onChange([...items, newItemizedAmountLine()])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add row
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => onChange([])}
        >
          Cancel itemizing
        </Button>
      </div>
    </div>
  );
}
