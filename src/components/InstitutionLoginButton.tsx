import { ExternalLink, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Institution, InstitutionLink } from "@/lib/supabase";

/** Opens a URL in the system browser (ADR-093) — never a WebView/`<a>`/`window.open`. */
async function openInBrowser(url: string) {
  try {
    // Dynamic import keeps @capacitor/browser out of SSR evaluation and the
    // initial bundle (same pattern as src/lib/snapshot.ts).
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    toast.error("Couldn't open the page");
  }
}

/**
 * ADR-093: opens the institution's real login page in the system browser
 * (Android Custom Tab via @capacitor/browser), never a WebView / <a> / window.open
 * — OS-level Autofill only triggers on a real browser page. Credential fill stays
 * entirely with the OS; the app never stores or sees a password.
 *
 * ADR-106: "Log In" opens a `bill_pay` link when one is set, falling back to
 * `login_url` ("Main site") otherwise. Every other stored link (Patient
 * Portal, any custom "Other" links) gets its own button alongside it, same
 * open mechanism. Renders nothing when there's no login_url and no links at
 * all. `links` is optional so callers that haven't wired it up yet still
 * get the pre-ADR-106 single "Log In" behavior unchanged.
 *
 * ADR-106 addendum: `usernameHint` lets a caller show "Use: <username>"
 * for a specific household member's own login (e.g. per-member sections at
 * a merged institution like Alpine Medical/Labcorp) — shown regardless of
 * `sign_in_with_google`, since none of the real institutions this was built
 * for actually use Google sign-in, they just have a distinct real username
 * per person. Falls back to the original Google-chooser-only hint when
 * `usernameHint` isn't passed, so every existing call site is unchanged.
 * `compact` renders an icon-only "Log In" button with the hint as a native
 * title tooltip instead of visible text, and omits the extra-link buttons
 * (Patient Portal etc. aren't member-specific — shown once, not per person).
 */
export function InstitutionLoginButton({
  institution,
  links = [],
  usernameHint,
  compact = false,
}: {
  institution?: Institution | null;
  links?: InstitutionLink[];
  usernameHint?: string | null;
  compact?: boolean;
}) {
  const billPayUrl = links.find((l) => l.kind === "bill_pay")?.url?.trim();
  const loginUrl = billPayUrl || institution?.login_url?.trim();
  const extraLinks = compact ? [] : links.filter((l) => l.kind !== "bill_pay" && l.url?.trim());
  if (!loginUrl && extraLinks.length === 0) return null;

  const hintUsername = usernameHint?.trim() || institution?.login_username?.trim();
  const hint = usernameHint?.trim()
    ? `Use: ${usernameHint.trim()}`
    : institution?.sign_in_with_google && hintUsername
      ? `Sign in with Google — use ${hintUsername}`
      : null;

  if (compact) {
    return loginUrl ? (
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        title={hint ?? "Log In"}
        aria-label={hint ?? "Log In"}
        onClick={() => openInBrowser(loginUrl)}
      >
        <LogIn className="h-4 w-4" />
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {loginUrl ? (
        <Button size="sm" variant="outline" onClick={() => openInBrowser(loginUrl)}>
          <LogIn /> Log In
        </Button>
      ) : null}
      {extraLinks.map((l) => (
        <Button
          key={l.id}
          size="sm"
          variant="outline"
          onClick={() => openInBrowser(l.url)}
        >
          <ExternalLink />
          {l.kind === "patient_portal" ? "Patient Portal" : l.label || "Link"}
        </Button>
      ))}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
