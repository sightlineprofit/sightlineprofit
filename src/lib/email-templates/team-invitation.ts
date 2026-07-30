export function buildTeamInvitationEmail(args: {
  memberName: string | null;
  principalName: string;
  firmName: string;
  role: string;
  acceptUrl: string;
}) {
  const { subject, templateVariables } = buildTeamInvitationContent(args);
  const roleLabel = templateVariables.ROLE_LABEL;
  const greeting = templateVariables.GREETING;
  const text = [
    greeting,
    "",
    `${args.principalName} invited you to join ${args.firmName} on Sightline as ${roleLabel}.`,
    "",
    `Accept your invitation: ${args.acceptUrl}`,
    "",
    "Sightline helps interior design firms know what to charge, track profitability, and plan capacity.",
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#2C2C2C;background:#FAF7F2;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E8E0D5;border-radius:8px;padding:28px">
    <p style="margin:0 0 16px;font-size:15px">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      <strong>${escapeHtml(args.principalName)}</strong> invited you to join
      <strong>${escapeHtml(args.firmName)}</strong> on Sightline as <strong>${escapeHtml(roleLabel)}</strong>.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(args.acceptUrl)}" style="display:inline-block;background:#B8860B;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px">Accept invitation</a>
    </p>
    <p style="margin:0 0 8px;font-size:12px;color:#6B6259;line-height:1.5">
      Or copy this link: <a href="${escapeHtml(args.acceptUrl)}" style="color:#B8860B">${escapeHtml(args.acceptUrl)}</a>
    </p>
    <p style="margin:24px 0 0;font-size:11px;color:#8A7F75">If you did not expect this email, you can ignore it.</p>
  </div>
</body></html>`;
  return { subject, html, text, templateVariables };
}

/** Variables for Resend template `sightline-team-invite` (see deploy/resend/templates/). */
export function buildTeamInvitationContent(args: {
  memberName: string | null;
  principalName: string;
  firmName: string;
  role: string;
  acceptUrl: string;
}) {
  const greeting = args.memberName?.trim() ? `Hi ${args.memberName.trim()},` : "Hi there,";
  const roleLabel = args.role.replace(/_/g, " ");
  const subject = `${args.principalName} invited you to ${args.firmName} on Sightline`;
  const templateVariables = {
    GREETING: greeting,
    PRINCIPAL_NAME: args.principalName,
    FIRM_NAME: args.firmName,
    ROLE_LABEL: roleLabel,
    ACCEPT_URL: args.acceptUrl,
  };
  return { subject, templateVariables };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
