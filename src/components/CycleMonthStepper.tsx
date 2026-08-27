import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel } from "@/lib/format";

/**
 * ADR-085 addendum: step the Bills/Debts detail panel back to a prior month's
 * cycle. `monthOffset` is 0 for the current month and negative going back; the
 * right chevron is disabled at 0 (never future). Monthly items only — the caller
 * decides whether to render it.
 */
export function CycleMonthStepper({
  monthOffset,
  onChange,
  targetMonthKey,
}: {
  monthOffset: number;
  onChange: (next: number) => void;
  targetMonthKey: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-1 py-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Previous month"
        onClick={() => onChange(monthOffset - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium">{monthLabel(targetMonthKey)}</span>
      <div className="flex items-center gap-1">
        {monthOffset !== 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onChange(0)}
          >
            This month
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Next month"
          disabled={monthOffset >= 0}
          onClick={() => onChange(monthOffset + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
