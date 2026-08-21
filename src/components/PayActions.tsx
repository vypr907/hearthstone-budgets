import { Button } from "@/components/ui/button";
import { usePayFlow } from "@/lib/pay-flow";
import { useCycleState, stateVisual } from "@/lib/ledger-state";
import { formatMoney } from "@/lib/format";
import type { Payable } from "@/lib/payments";
import { ArrearsPaymentAction } from "@/components/ArrearsPaymentAction";

const ACTION_LABEL: Record<string, string> = {
  unpaid: "Submit payment",
  partial: "Submit another payment",
  pending: "Mark cleared",
  cleared: "Reset this cycle",
};

/**
 * Single tap control shared by Bills, Debts and Everything (ADR-036): the
 * button reflects the ledger-derived state and advances the state machine.
 */
export function PayActions({
  payable,
  className,
}: {
  payable: Payable;
  className?: string;
}) {
  const { tap, busy, picker } = usePayFlow();
  const infoOf = useCycleState();
  const info = infoOf(payable);
  const { Icon, className: color, label } = stateVisual(info.state);

  return (
    <>
      <Button
        variant={info.state === "cleared" ? "outline" : "default"}
        className={`h-12 w-full justify-start gap-2 ${className ?? ""}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          tap(payable, info);
        }}
      >
        <Icon className={`h-5 w-5 ${info.state === "cleared" ? color : ""}`} />
        <span>{ACTION_LABEL[info.state]}</span>
        <span className="ml-auto text-xs opacity-80">
          {label}
          {info.remaining > 0 ? ` · ${formatMoney(info.remaining)} left` : ""}
        </span>
      </Button>
      {/* ADR-076: hidden unless something is owed from before the current cycle. */}
      <ArrearsPaymentAction payable={payable} className="mt-2" />
      {/*
        The pay-flow dialogs portal their DOM to <body>, but React synthetic
        events still bubble through the React tree — so a click inside the
        portaled amount/fee dialog reaches the clickable bill/debt card above
        and opens its detail view. Stop propagation here so the dialogs are
        isolated from the card's onClick.
      */}
      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {picker}
      </div>
    </>
  );
}
