import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type OAuthResult =
  | { redirected: true }
  | { error: Error };

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ): Promise<OAuthResult> => {
      if (provider !== "google") {
        return {
          error: new Error(
            `${provider} sign-in is not configured. Use Google or email/password.`,
          ),
        };
      }

      const redirectTo = opts?.redirect_uri ?? `${window.location.origin}/post-auth`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
            ...opts?.extraParams,
          },
        },
      });

      if (error) {
        return { error };
      }

      if (data?.url) {
        window.location.href = data.url;
        return { redirected: true };
      }

      return { error: new Error("No OAuth redirect URL returned from Supabase") };
    },
  },
};
