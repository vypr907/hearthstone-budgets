import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useHousehold, useSetExportFormat } from "@/lib/data-hooks";
import type { ExportFormat } from "@/lib/supabase";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hearthstone" },
      {
        name: "description",
        content: "Household preferences, including the Status Snapshot export format.",
      },
      { property: "og:title", content: "Settings — Hearthstone" },
      {
        property: "og:description",
        content: "Household preferences, including the Status Snapshot export format.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: household } = useHousehold();
  const setFormat = useSetExportFormat();
  const current: ExportFormat = household?.export_format === "pdf" ? "pdf" : "png";

  function choose(f: ExportFormat) {
    if (f === current) return;
    setFormat.mutate(f, {
      onSuccess: () => toast.success(`Snapshot exports will use ${f.toUpperCase()}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
    });
  }

  return (
    <>
      <AppHeader title="Settings" />
      <div className="space-y-3 p-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Snapshot export format
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Status Snapshot is rendered once and saved in this format.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["png", "pdf"] as ExportFormat[]).map((f) => (
                <Button
                  key={f}
                  className="h-12"
                  variant={current === f ? "default" : "outline"}
                  disabled={setFormat.isPending}
                  onClick={() => choose(f)}
                >
                  {f.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
