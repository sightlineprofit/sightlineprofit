#!/usr/bin/env node
/**
 * Register sightlineprofit.com in Resend and print DNS records for Cloudflare.
 *
 *   RESEND_API_KEY=re_... node scripts/register-resend-domain.mjs
 *
 * Optional: DOMAIN=sightlineprofit.com
 */

const apiKey = process.env.RESEND_API_KEY?.trim();
const domain = process.env.DOMAIN?.trim() || "sightlineprofit.com";

if (!apiKey) {
  console.error("Set RESEND_API_KEY");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

const listRes = await fetch("https://api.resend.com/domains", { headers });
if (!listRes.ok) {
  const err = await listRes.json().catch(() => ({}));
  console.error("Could not list domains:", listRes.status, err.message ?? err);
  process.exit(1);
}

const listBody = await listRes.json();
const existing = listBody.data?.find((d) => d.name === domain);

let domainId = existing?.id;
if (!domainId) {
  const createRes = await fetch("https://api.resend.com/domains", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: domain }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("Create domain failed:", createRes.status, created.message ?? created);
    process.exit(1);
  }
  domainId = created.id;
  console.log(`Created domain ${domain} (id ${domainId})\n`);
  printRecords(created.records ?? []);
} else {
  console.log(`Domain ${domain} already exists (id ${domainId}). Fetching records…\n`);
  const getRes = await fetch(`https://api.resend.com/domains/${domainId}`, { headers });
  const detail = await getRes.json();
  if (!getRes.ok) {
    console.error("Could not fetch domain:", getRes.status, detail);
    process.exit(1);
  }
  console.log(`Status: ${detail.status ?? "unknown"}\n`);
  printRecords(detail.records ?? []);
}

console.log("\nCloudflare tips:");
console.log("- Add each record under DNS for sightlineprofit.com");
console.log("- CNAME/MX: Proxy = DNS only (grey cloud)");
console.log("- After records verify in Resend, run: npm run setup:resend-secrets");

function printRecords(records) {
  if (!records.length) {
    console.log("(No records returned — check Resend dashboard → Domains)");
    return;
  }
  for (const r of records) {
    const host = r.name?.includes(domain) ? r.name.replace(`.${domain}`, "") : r.name;
    console.log(`--- ${r.record ?? r.type} (${r.status ?? "?"}) ---`);
    console.log(`  Type:     ${r.type}`);
    console.log(`  Name:     ${host ?? r.name}`);
    console.log(`  Content:  ${r.value}`);
    if (r.priority != null) console.log(`  Priority: ${r.priority}`);
    console.log("");
  }
}
