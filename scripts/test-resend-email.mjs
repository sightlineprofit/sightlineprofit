#!/usr/bin/env node
/**
 * Send a one-off test email via Resend (validates API key + domain before prod invite).
 *
 *   RESEND_API_KEY=re_... \
 *   TRANSACTIONAL_EMAIL_FROM='Sightline <hello@sightlineprofit.com>' \
 *   TEST_EMAIL_TO=you@example.com \
 *   node scripts/test-resend-email.mjs
 */

const apiKey = process.env.RESEND_API_KEY?.trim();
const from =
  process.env.TRANSACTIONAL_EMAIL_FROM?.trim() || "Sightline <hello@sightlineprofit.com>";
const to = process.env.TEST_EMAIL_TO?.trim();

if (!apiKey) {
  console.error("Set RESEND_API_KEY");
  process.exit(1);
}
if (!to) {
  console.error("Set TEST_EMAIL_TO (recipient inbox for this test)");
  process.exit(1);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "Sightline — Resend test",
    html: "<p>If you received this, Resend is configured correctly for Sightline team invites.</p>",
    text: "If you received this, Resend is configured correctly for Sightline team invites.",
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Resend error:", res.status, body.message ?? body);
  process.exit(1);
}

console.log("Test email sent.", body.id ? `Resend id: ${body.id}` : "");
