#!/usr/bin/env node
/**
 * Create + publish the Sightline team-invite template in Resend.
 * Requires API key with Templates access (not send-only).
 *
 *   RESEND_API_KEY=re_... npm run setup:resend-templates
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_ALIAS = "sightline-team-invite";
const TEMPLATE_NAME = "Sightline team invite";

const apiKey = process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error("Set RESEND_API_KEY (full access or templates + sending).");
  process.exit(1);
}

const htmlPath = path.join(ROOT, "deploy/resend/templates/team-invitation.html");
const html = fs.readFileSync(htmlPath, "utf8");

const variables = [
  { key: "GREETING", type: "string", fallback_value: "Hi there," },
  { key: "PRINCIPAL_NAME", type: "string", fallback_value: "Your principal" },
  { key: "FIRM_NAME", type: "string", fallback_value: "Your firm" },
  { key: "ROLE_LABEL", type: "string", fallback_value: "team member" },
  { key: "ACCEPT_URL", type: "string", fallback_value: "https://sightlineprofit.com" },
];

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.resend.com${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || JSON.stringify(data);
    throw new Error(`${method} ${urlPath} → ${res.status}: ${msg}`);
  }
  return data;
}

let templateId = null;

const list = await api("GET", "/templates").catch((e) => {
  if (String(e.message).includes("401") && String(e.message).includes("send emails")) {
    console.error(`
Your RESEND_API_KEY is send-only and cannot create templates via API.

Create the template in the Resend dashboard instead:
  1. https://resend.com/templates → Create template
  2. Alias: ${TEMPLATE_ALIAS}
  3. Paste HTML from: deploy/resend/templates/team-invitation.html
  4. Add variables: GREETING, PRINCIPAL_NAME, FIRM_NAME, ROLE_LABEL, ACCEPT_URL (all strings)
  5. Publish the template
  6. npm run setup:resend-secrets  (sets RESEND_TEAM_INVITE_TEMPLATE_ID=${TEMPLATE_ALIAS})

See deploy/resend/templates/README.md
`);
    process.exit(1);
  }
  throw e;
});
const existing = list.data?.find(
  (t) => t.alias === TEMPLATE_ALIAS || t.name === TEMPLATE_NAME,
);

if (existing?.id) {
  templateId = existing.id;
  console.log(`Updating draft template ${templateId} (${TEMPLATE_ALIAS})…`);
  await api("PATCH", `/templates/${templateId}`, {
    name: TEMPLATE_NAME,
    alias: TEMPLATE_ALIAS,
    html,
    variables,
    from: "Sightline <hello@sightlineprofit.com>",
    subject: "{{{PRINCIPAL_NAME}}} invited you to {{{FIRM_NAME}}} on Sightline",
  });
} else {
  console.log(`Creating template ${TEMPLATE_ALIAS}…`);
  const created = await api("POST", "/templates", {
    name: TEMPLATE_NAME,
    alias: TEMPLATE_ALIAS,
    html,
    variables,
    from: "Sightline <hello@sightlineprofit.com>",
    subject: "{{{PRINCIPAL_NAME}}} invited you to {{{FIRM_NAME}}} on Sightline",
  });
  templateId = created.id;
}

console.log("Publishing template…");
await api("POST", `/templates/${templateId}/publish`);

console.log(`
✅ Template published.

Set on Cloudflare Worker:
  RESEND_TEAM_INVITE_TEMPLATE_ID=${TEMPLATE_ALIAS}

  RESEND_TEAM_INVITE_TEMPLATE_ID=${TEMPLATE_ALIAS} \\
  RESEND_API_KEY=... \\
  TRANSACTIONAL_EMAIL_FROM='Sightline <hello@sightlineprofit.com>' \\
  npm run setup:resend-secrets

Or: npx wrangler secret put RESEND_TEAM_INVITE_TEMPLATE_ID --config .output/server/wrangler.json
    (value: ${TEMPLATE_ALIAS})

Template id (UUID): ${templateId}
`);
