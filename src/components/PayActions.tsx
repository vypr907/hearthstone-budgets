import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMarkCleared, useMarkSubmitted, useMarkUnpaid, type Payable } from "@/lib/payments";

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
  const submit = useMarkSubmitted();
  const clear = useMarkCleared();
  const undo = useMarkUnpaid();
  const busy = submit.isPending || clear.isPending || undo.isPending;

  async function run(fn: () => Promise<unknown>, msg: string) {
    try {
      const res = (await fn()) as { next_due_date?: string | null } | undefined;
      toast.success(
        res?.next_due_date ? `${msg} · next due ${res.next_due_date}` : msg,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className={`grid grid-cols-3 gap-2 ${className ?? ""}`}>
      <Button
        variant={status === "pending" ? "default" : "outline"}
        className="h-11"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          run(() => submit.mutateAsync(payable), `${payable.name} submitted`);
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
          run(() => clear.mutateAsync(payable), `${payable.name} cleared`);
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
          run(() => undo.mutateAsync(payable), `${payable.name} set to unpaid`);
        }}
      >
        Undo
      </Button>
    </div>
  );
}
