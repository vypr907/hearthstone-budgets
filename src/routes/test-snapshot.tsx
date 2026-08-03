import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmojiIcon, ItemBar, ProgressRing, itemColor } from "@/components/viz";

export const Route = createFileRoute("/test-snapshot")({
  component: TestSnapshotPage,
});

function TestSnapshotPage() {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: html2canvas } = await import("html2canvas-pro");
      const node = nodeRef.current!;

      // Mirror the clone-to-fixed-origin technique from src/lib/snapshot.ts
      const clone = node.cloneNode(true) as HTMLElement;
      const wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.width = `${node.offsetWidth}px`;
      wrapper.style.height = `${node.offsetHeight}px`;
      wrapper.style.zIndex = "-9999";
      wrapper.style.overflow = "hidden";
      clone.style.padding = "0";
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      let canvas: HTMLCanvasElement;
      try {
        canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          foreignObjectRendering: true,
          width: clone.offsetWidth,
          height: clone.offsetHeight,
          windowWidth: clone.offsetWidth,
          backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
        });
      } finally {
        document.body.removeChild(wrapper);
      }

      if (!cancelled) {
        setDataUrl(canvas.toDataURL("image/png"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div
        ref={nodeRef}
        className="space-y-3 rounded-2xl bg-background p-3"
        style={{ boxShadow: "var(--shadow-card)", maxWidth: 400 }}
      >
        <Card
          className="border-0 text-brand-foreground"
          style={{ background: "var(--gradient-brand)", boxShadow: "var(--shadow-card)" }}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                Status Snapshot
              </p>
              <h2 className="truncate text-2xl font-bold tracking-tight">Test Household</h2>
              <p className="text-xs opacity-80">Monday, August 3, 2026 at 2:26 PM</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">$2,847.00</p>
            </div>
            <ProgressRing value={68} size={56} color="var(--destructive)" label="68% overdue" />
          </CardContent>
        </Card>

        <Card
          className="border-2 border-destructive/40 bg-destructive/5"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <CardContent className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                Overdue
              </p>
              <p className="text-2xl font-bold tabular-nums text-destructive">$1,920.00</p>
            </div>
            <div className="mt-1 divide-y divide-destructive/15">
              <div className="flex items-center gap-3 py-2.5">
                <EmojiIcon name="Credit Card" fallback="🏦" className="bg-destructive/10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">Credit Card</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    5 days overdue
                  </p>
                  <ItemBar value={100} color="var(--destructive)" className="mt-1.5" />
                </div>
                <p className="text-base font-bold tabular-nums text-destructive">$1,200.00</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Next 14 days
              </p>
              <p className="text-2xl font-bold tabular-nums">$927.00</p>
            </div>
            <div className="mt-1 divide-y divide-border/40">
              <div className="flex items-center gap-3 py-2.5">
                <EmojiIcon name="Electric" fallback="⚡" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">Electric</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Aug 8 · in 5 days
                  </p>
                  <ItemBar value={65} color={itemColor(0)} className="mt-1.5" />
                </div>
                <p className="text-base font-bold tabular-nums text-foreground">$127.00</p>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <EmojiIcon name="Rent" fallback="🏠" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">Rent</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Aug 10 · in 7 days
                  </p>
                  <ItemBar value={50} color={itemColor(1)} className="mt-1.5" />
                </div>
                <p className="text-base font-bold tabular-nums text-foreground">$800.00</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dataUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Captured PNG ({dataUrl.length} chars)</p>
          <img src={dataUrl} alt="Snapshot export" className="max-w-full rounded-lg border" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Capturing…</p>
      )}
    </div>
  );
}
