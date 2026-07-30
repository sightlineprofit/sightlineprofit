/** Canonical browser origin for auth redirects (PKCE verifier is per-origin). */
export function getAuthAppOrigin(): string {
  if (typeof window === "undefined") return "http://localhost:8080";
  const { hostname, origin } = window.location;
  if (hostname === "sightlineprofit.com" || hostname === "www.sightlineprofit.com") {
    return "https://sightlineprofit.com";
  }
  return origin;
}

/** Runs before React/Supabase init — must not import supabase. */
export function runEarlyAuthRouting(): void {
  if (typeof window === "undefined") return;

  const { hostname, pathname, search, hash, protocol } = window.location;
  const params = new URLSearchParams(search);
  const hasOAuth =
    params.has("code") || params.has("error") || hash.includes("access_token=");

  // PKCE verifier lives in localStorage per-origin — always canonicalize www → apex.
  if (hostname === "www.sightlineprofit.com") {
    window.location.replace(
      `https://sightlineprofit.com${pathname}${search}${hash}`,
    );
    return;
  }

  // Supabase may land the code on Site URL (/) instead of /post-auth.
  if (hasOAuth && pathname !== "/post-auth") {
    window.location.replace(`/post-auth${search}${hash}`);
    return;
  }

  // Normalize accidental http -> https on production host.
  if (
    hostname === "sightlineprofit.com" &&
    protocol === "http:" &&
    hasOAuth
  ) {
    window.location.replace(`https://sightlineprofit.com${pathname}${search}${hash}`);
  }
}

// Execute synchronously on first import in the browser bundle.
runEarlyAuthRouting();
