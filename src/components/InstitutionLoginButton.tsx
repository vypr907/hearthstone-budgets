import { LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Institution } from "@/lib/supabase";

/**
 * ADR-093: opens the institution's real login page in the system browser
 * (Android Custom Tab via @capacitor/browser), never a WebView / <a> / window.open
 * — OS-level Autofill only triggers on a real browser page. Credential fill stays
 * entirely with the OS; the app never stores or sees a password.
 *
 * Renders nothing unless `login_url` is set. When the institution uses Google
 * sign-in and has a `login_username`, a small hint shows which account to pick
 * (the app can't force-select it in Google's chooser).
 */
export function InstitutionLoginButton({ institution }: { institution?: Institution | null }) {
  const url = institution?.login_url?.trim();
  if (!url) return null;

  const username = institution?.login_username?.trim();
  const hint =
    institution?.sign_in_with_google && username ? `Sign in with Google — use ${username}` : null;

  const openLogin = async () => {
    try {
      // Dynamic import keeps @capacitor/browser out of SSR evaluation and the
      // initial bundle (same pattern as src/lib/snapshot.ts).
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } catch {
      toast.error("Couldn't open the login page");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={openLogin}>
        <LogIn /> Log In
      </Button>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
