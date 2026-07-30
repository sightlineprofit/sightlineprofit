import { createFileRoute } from "@tanstack/react-router";
import { completeGoogleCalendarOAuth } from "@/lib/calendar-sync.functions";

export const Route = createFileRoute("/api/calendar/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        const appBase = (process.env.PUBLIC_APP_URL || "http://localhost:8080").replace(/\/$/, "");
        const failRedirect = `${appBase}/time-calendar?calendar=error`;
        const okRedirect = `${appBase}/time-calendar?calendar=connected`;

        if (oauthError || !code || !state) {
          return Response.redirect(
            `${failRedirect}&reason=${encodeURIComponent(oauthError || "missing_code")}`,
            302,
          );
        }

        try {
          await completeGoogleCalendarOAuth(code, state);
          return Response.redirect(okRedirect, 302);
        } catch (e) {
          console.error("[google-calendar-callback]", e);
          const msg = e instanceof Error ? e.message : "connect_failed";
          return Response.redirect(`${failRedirect}&reason=${encodeURIComponent(msg)}`, 302);
        }
      },
    },
  },
});
