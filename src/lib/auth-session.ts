import { supabase } from "@/integrations/supabase/client";

function cleanAuthParamsFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  params.delete("code");
  params.delete("error");
  params.delete("error_description");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}`,
  );
}

let exchangeInFlight: Promise<void> | null = null;

function isOAuthCallbackError(message: string): boolean {
  return /Unable to exchange external code|invalid grant|PKCE|code verifier|oauth/i.test(
    message,
  );
}

/** Exchange OAuth callback exactly once (no detectSessionInUrl double-exchange). */
export async function waitForAuthSession(): Promise<void> {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const oauthError = params.get("error");
  const hasHashToken = window.location.hash.includes("access_token=");
  const stripeSessionId = params.get("session_id");

  if (oauthError) {
    cleanAuthParamsFromUrl();
    throw new Error(
      params.get("error_description") ?? oauthError ?? "Google sign-in failed",
    );
  }

  // Stripe checkout return — session should already exist; never exchange OAuth code here.
  if (stripeSessionId?.startsWith("cs_")) {
    if (code) {
      cleanAuthParamsFromUrl();
    }
    return;
  }

  if (!code && !hasHashToken) {
    return;
  }

  const { data: { session: existing } } = await supabase.auth.getSession();
  if (existing) {
    cleanAuthParamsFromUrl();
    return;
  }

  if (!exchangeInFlight) {
    exchangeInFlight = (async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hasHashToken) {
          const { error } = await supabase.auth.getSession();
          if (error) throw error;
        }
        cleanAuthParamsFromUrl();
      } catch (error) {
        cleanAuthParamsFromUrl();
        const message = error instanceof Error ? error.message : "Sign-in failed";
        if (isOAuthCallbackError(message)) {
          throw new Error(
            "Google sign-in could not be completed. Please return to the login page and try again.",
          );
        }
        throw error instanceof Error ? error : new Error(message);
      }
    })();
  }

  try {
    await exchangeInFlight;
  } finally {
    exchangeInFlight = null;
  }
}

export async function getAccessTokenWithRetry(maxMs = 3000): Promise<string | undefined> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) return token;
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}
