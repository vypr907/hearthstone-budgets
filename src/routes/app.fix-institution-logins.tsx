import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useInstitutions, useUpsertInstitution } from "@/lib/data-hooks";
import { formatTypeLabel } from "@/lib/visual-meta";
import type { Institution } from "@/lib/supabase";

export const Route = createFileRoute("/app/fix-institution-logins")({
  head: () => ({
    meta: [
      { title: "Fix Institution Logins — Hearthstone" },
      {
        name: "description",
        content:
          "Add a login URL to institutions that don't have one yet, so account access stays one tap away.",
      },
      { property: "og:title", content: "Fix Institution Logins — Hearthstone" },
      {
        property: "og:description",
        content:
          "Add a login URL to institutions that don't have one yet, so account access stays one tap away.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FixInstitutionLoginsPage,
});

/**
 * Sibling repair screen to Fix Places (ADR-099): institutions saved without a
 * login_url have no quick way to reach their sign-in page from the app. Same
 * visual pattern as FixPlacesPage — a warning summary card, then one card per
 * problem row with an inline fixer.
 */
function FixInstitutionLoginsPage() {
  const { data: institutions = [] } = useInstitutions();
  const save = useUpsertInstitution();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const missing = useMemo(
    () => institutions.filter((i: Institution) => !i.login_url?.trim()),
    [institutions],
  );

  async function saveLoginUrl(inst: Institution) {
    const value = (drafts[inst.id] ?? "").trim();
    if (!value) return;
    try {
      await save.mutateAsync({ id: inst.id, name: inst.name, login_url: value });
      toast.success("Login URL saved");
      setDrafts((d) => {
        const next = { ...d };
        delete next[inst.id];
        return next;
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <AppHeader title="Fix Institution Logins" />
      <div className="space-y-3 p-4">
        {missing.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Every institution has a login URL
              </div>
              <EmptyState>Nothing to fix right now.</EmptyState>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-amber-500/40">
              <CardContent className="flex items-start gap-2 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <p className="font-semibold">
                    {missing.length} institution{missing.length === 1 ? "" : "s"} without a login URL
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Paste the sign-in page for each one so it's one tap away from the Institutions
                    screen.
                  </p>
                </div>
              </CardContent>
            </Card>

            {missing.map((inst) => (
              <Card key={inst.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{inst.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTypeLabel(inst.institution_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="https://example.com/login"
                      value={drafts[inst.id] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [inst.id]: e.target.value }))
                      }
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={!drafts[inst.id]?.trim() || save.isPending}
                      onClick={() => void saveLoginUrl(inst)}
                    >
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </>
  );
}
