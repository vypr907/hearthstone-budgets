import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useHousehold, useSetExportFormat } from "@/lib/data-hooks";
import { THEME_OPTIONS, useTheme, useSetTheme } from "@/lib/theme";
import { ThemeTokenPreview } from "@/components/ThemeTokenPreview";
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

  const currentTheme = useTheme();
  const setTheme = useSetTheme();

  function choose(f: ExportFormat) {
    if (f === current) return;
    setFormat.mutate(f, {
      onSuccess: () => toast.success(`Snapshot exports will use ${f.toUpperCase()}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
    });
  }

  function chooseTheme(value: (typeof THEME_OPTIONS)[number]["value"]) {
    if (value === currentTheme) return;
    const label = THEME_OPTIONS.find((t) => t.value === value)?.label ?? value;
    setTheme.mutate(value, {
      onSuccess: () => toast.success(`Theme set to ${label}`),
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
                Theme
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Your personal display preference — applies only to your device.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={setTheme.isPending}
                  onClick={() => chooseTheme(t.value)}
                  className={`flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-2 transition-colors ${
                    currentTheme === t.value
                      ? "border-primary"
                      : "border-transparent hover:border-border"
                  }`}
                  style={{ backgroundColor: t.background }}
                >
                  <span
                    className="h-4 w-4 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: t.brand }}
                  />
                  <span className="text-[11px] font-medium" style={{ color: t.text }}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
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
        <Card>
          <CardContent className="p-4">
            <details>
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Theme token reference
              </summary>
              <div className="mt-3">
                <ThemeTokenPreview />
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
