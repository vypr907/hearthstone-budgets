import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CycleUnit = "days" | "weeks";

/**
 * ADR-040: only `cycle_interval_days` is stored. The unit shown when editing is
 * derived — whole weeks display as weeks, everything else as days.
 */
export function deriveCustomInterval(intervalDays: number | null | undefined): {
  count: string;
  unit: CycleUnit;
} {
  const days = Number(intervalDays ?? 0);
  if (!days || !Number.isFinite(days) || days <= 0) return { count: "", unit: "days" };
  if (days >= 7 && days % 7 === 0) return { count: String(days / 7), unit: "weeks" };
  return { count: String(days), unit: "days" };
}

/** Convert the entered count + unit to a day count, or null when invalid. */
export function toIntervalDays(count: string, unit: CycleUnit): number | null {
  const n = Number(count);
  if (!count.trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(unit === "weeks" ? n * 7 : n);
}

export function CustomCycleFields({
  count,
  unit,
  onCountChange,
  onUnitChange,
}: {
  count: string;
  unit: CycleUnit;
  onCountChange: (v: string) => void;
  onUnitChange: (v: CycleUnit) => void;
}) {
  const days = toIntervalDays(count, unit);
  return (
    <div>
      <Label>Repeats every</Label>
      <div className="grid grid-cols-2 gap-3">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="e.g. 4"
          value={count}
          onChange={(e) => onCountChange(e.target.value)}
          className="h-11"
        />
        <Select value={unit} onValueChange={(v) => onUnitChange(v as CycleUnit)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days">Days</SelectItem>
            <SelectItem value="weeks">Weeks</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {days ? `Stored as ${days} day${days === 1 ? "" : "s"}.` : "Required for custom cycles."}
      </p>
    </div>
  );
}
