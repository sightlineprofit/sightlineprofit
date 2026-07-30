/**
 * Transactional email via Resend (https://resend.com).
 * Set RESEND_API_KEY + TRANSACTIONAL_EMAIL_FROM on the Cloudflare Worker.
 */

import { getRuntimeEnv, getWorkerEnvProbe } from "@/lib/runtime-env.server";

export type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: {
    id: string;
    variables: Record<string, string | number>;
  };
  replyTo?: string | null;
  idempotencyKey?: string;
};

export class TransactionalEmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Transactional email is not configured on the server. Set RESEND_API_KEY and TRANSACTIONAL_EMAIL_FROM on the Cloudflare Worker (npm run setup:resend-secrets).",
    );
    this.name = "TransactionalEmailNotConfiguredError";
  }
}

function readResendApiKey(): string | undefined {
  return getRuntimeEnv("RESEND_API_KEY") || getRuntimeEnv("RESEND_KEY");
}

function isLocalDev(): boolean {
  const nodeEnv = getRuntimeEnv("NODE_ENV") ?? "";
  if (nodeEnv === "development" || nodeEnv === "test") return true;
  const url = getRuntimeEnv("PUBLIC_APP_URL") ?? "";
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export function getTransactionalEmailConfig() {
  const resendKey = readResendApiKey();
  const hasSupabaseServiceKey = !!getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    hasResendKey: !!resendKey,
    hasFrom: !!(getRuntimeEnv("TRANSACTIONAL_EMAIL_FROM") || getRuntimeEnv("EMAIL_FROM")),
    hasTemplateId: !!getRuntimeEnv("RESEND_TEAM_INVITE_TEMPLATE_ID"),
    publicAppUrl: getRuntimeEnv("PUBLIC_APP_URL") ?? null,
    nodeEnv: getRuntimeEnv("NODE_ENV") ?? null,
    /** If false, Worker env bindings are not reaching this handler at all. */
    hasSupabaseServiceKey,
    probe: getWorkerEnvProbe(),
  };
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<{ sent: boolean; skipped?: boolean; providerId?: string }> {
  const apiKey = readResendApiKey();
  const from =
    getRuntimeEnv("TRANSACTIONAL_EMAIL_FROM") ||
    getRuntimeEnv("EMAIL_FROM") ||
    "Sightline <hello@sightlineprofit.com>";

  if (!apiKey) {
    if (isLocalDev()) {
      console.warn("[transactional-email] RESEND_API_KEY unset; skipped send to", input.to);
      return { sent: false, skipped: true };
    }
    throw new TransactionalEmailNotConfiguredError();
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);
  }

  const payload: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    reply_to: input.replyTo ?? undefined,
  };

  if (input.template?.id) {
    payload.template = {
      id: input.template.id,
      variables: input.template.variables,
    };
  } else {
    if (!input.html) {
      throw new Error("sendTransactionalEmail: html or template is required");
    }
    payload.html = input.html;
    payload.text = input.text ?? undefined;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    throw new Error(body.message || `Resend API error (${res.status})`);
  }
  if (!body.id) {
    throw new Error("Resend accepted the request but returned no message id");
  }

  return { sent: true, providerId: body.id };
}
