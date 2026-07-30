import { createFileRoute } from "@tanstack/react-router";
import { completePinterestOAuth } from "@/lib/pinterest.server";
import { getPublicAppUrl } from "@/lib/public-app-url.server";

export const Route = createFileRoute("/auth/pinterest/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const oauthError = url.searchParams.get("error");
        const appBase = getPublicAppUrl();
        const failRedirect = `${appBase}/future?tab=vision&pinterest=error`;
        const okRedirect = `${appBase}/future?tab=vision&pinterest=connected`;

        if (oauthError || !code || !state) {
          return Response.redirect(failRedirect, 302);
        }

        try {
          await completePinterestOAuth(code, state);
          return Response.redirect(okRedirect, 302);
        } catch (e) {
          console.error("[pinterest-callback]", e);
          return Response.redirect(failRedirect, 302);
        }
      },
    },
  },
});
