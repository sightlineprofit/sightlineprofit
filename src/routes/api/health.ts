import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseEnvStatus } from "@/lib/supabase-env.server";
import { getPublicAppUrl, getWorkerStringEnv } from "@/lib/public-app-url.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = getSupabaseEnvStatus();
        const publicAppUrl = getPublicAppUrl();
        const resendConfigured =
          !!getWorkerStringEnv("RESEND_API_KEY") || !!getWorkerStringEnv("RESEND_KEY");

        const ok =
          supabase.hasUrl &&
          supabase.hasPublishableKey &&
          supabase.hasServiceRoleKey &&
          supabase.projectRef === "nizjqvbxrmxkkmnnqzpy";

        return Response.json(
          {
            ok,
            appUrl: publicAppUrl,
            supabase,
            worker: {
              resendConfigured,
              stripeConfigured: !!getWorkerStringEnv("STRIPE_LIVE_API_KEY"),
            },
          },
          { status: ok ? 200 : 503 },
        );
      },
    },
  },
});
