import { Button } from "@/components/ui/button";
import { usePayFlow } from "@/lib/pay-flow";
import type { Payable } from "@/lib/payments";

/** Shared submit/clear/undo controls for bills and debts. */
export function PayActions({
  payable,
  status,
  className,
}: {
  payable: Payable;
  status: string | null | undefined;
  className?: string;
}) {
  const { start, markUnpaid, busy, picker } = usePayFlow();

  return (
    <>
      <div className={`grid grid-cols-3 gap-2 ${className ?? ""}`}>
        <Button
          variant={status === "pending" ? "default" : "outline"}
          className="h-11"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            start(payable, "submitted");
          }}
        >
          Submitted
        </Button>
        <Button
          variant={status === "cleared" ? "default" : "outline"}
          className="h-11"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            start(payable, "cleared");
          }}
        >
          Cleared
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void markUnpaid(payable);
          }}
        >
          Undo
        </Button>
      </div>
      {picker}
    </>
  );
}
