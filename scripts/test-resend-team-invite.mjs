#!/usr/bin/env node
/**
 * Send a sample team invite using the Resend template + same vars as production.
 *
 *   RESEND_API_KEY=re_... \
 *   RESEND_TEAM_INVITE_TEMPLATE_ID=sightline-team-invite \
 *   TEST_EMAIL_TO=you@example.com \
 *   npm run test:resend-team-invite
 */

const apiKey = process.env.RESEND_API_KEY?.trim();
const templateId =
  process.env.RESEND_TEAM_INVITE_TEMPLATE_ID?.trim() || "sightline-team-invite";
const to = process.env.TEST_EMAIL_TO?.trim();
const from =
  process.env.TRANSACTIONAL_EMAIL_FROM?.trim() || "Sightline <hello@sightlineprofit.com>";

if (!apiKey || !to) {
  console.error("Set RESEND_API_KEY and TEST_EMAIL_TO");
  process.exit(1);
}

const acceptUrl = "https://sightlineprofit.com/accept-invite?token=PREVIEW_ONLY_NOT_VALID";
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "Caprice Gossett invited you to Propos'Ability on Sightline",
    template: {
      id: templateId,
      variables: {
        GREETING: "Hi there,",
        PRINCIPAL_NAME: "Caprice Gossett",
        FIRM_NAME: "Propos'Ability",
        ROLE_LABEL: "team",
        ACCEPT_URL: acceptUrl,
      },
    },
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Send failed:", res.status, body.message ?? body);
  process.exit(1);
}
console.log("Team invite template test sent.", body.id ? `Id: ${body.id}` : "");
