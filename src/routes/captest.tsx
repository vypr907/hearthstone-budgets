import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmojiIcon, ItemBar, ProgressRing, itemColor } from "@/components/viz";

export const Route = createFileRoute("/captest")({ component: CapTest });

function CapTest() {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  async function run() {
    const { default: html2canvas } = await import("html2canvas-pro");
    const node = ref.current!;
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      width: node.offsetWidth,
      windowWidth: node.offsetWidth,
      backgroundColor: getComputedStyle(node).backgroundColor || "#ffffff",
    });
    setUrl(canvas.toDataURL("image/png"));
  }

  return (
    <div className="bg-background p-4">
      <div ref={ref} className="max-w-lg bg-background p-4 space-y-3">
        <Card className="shadow-md">
          <CardContent className="p-4 flex items-center gap-4">
            <ProgressRing value={68} size={48} color={itemColor(1)} />
            <div>
              <div className="text-2xl font-bold">$1,284.50</div>
              <div className="text-sm text-muted-foreground">Overdue total</div>
            </div>
            <EmojiIcon name="Electric" />
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-4 space-y-2">
            <ItemBar value={70} color={itemColor(2)} />
            <ItemBar value={30} color={itemColor(3)} />

          </CardContent>
        </Card>
      </div>
      <button id="cap" onClick={run} className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground">
        Capture
      </button>
      {url && <img id="out" src={url} alt="capture" width={480} />}
    </div>
  );
}
