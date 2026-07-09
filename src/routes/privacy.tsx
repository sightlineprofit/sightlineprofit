import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/legal/LegalShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Sightline by Propos'Ability" },
      {
        name: "description",
        content:
          "How Sightline by Propos'Ability collects, uses, and protects your information.",
      },
      { property: "og:title", content: "Privacy Policy — Sightline by Propos'Ability" },
      {
        property: "og:description",
        content:
          "How Sightline by Propos'Ability collects, uses, and protects your information.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/privacy" }],
  }),
  component: PrivacyPage,
});

const sections: LegalSection[] = [
  {
    h: "What we collect",
    body: "When you create a Sightline account, we collect your name, email address, firm name, and the financial data you enter during setup — including compensation targets, operating expenses, and team information. We also collect time entries, project data, and usage information to power the product.",
  },
  {
    h: "How we use it",
    body: "Your data is used exclusively to provide the Sightline service — calculating your aligned rate, tracking project profitability, and powering capacity planning. We do not sell your data to third parties. We do not use your financial data for advertising.",
  },
  {
    h: "Who we share it with",
    body: "We use Supabase to store your data securely, Stripe to process payments, and Ivorey (powered by GoHighLevel) to send transactional and marketing emails. These service providers are contractually required to protect your information and may not use it for their own purposes.",
  },
  {
    h: "Your rights",
    body: "You may request access to, correction of, or deletion of your personal data at any time by contacting us at hello@proposability.com. Deletion requests are processed within 30 days.",
  },
  {
    h: "Data security",
    body: "All data is encrypted in transit and at rest. Payment information is handled entirely by Stripe and is never stored on Sightline's servers. We follow industry-standard security practices to protect your information.",
  },
  {
    h: "Cookies",
    body: "Sightline uses cookies and similar technologies to maintain your session and improve the product experience. We do not use third-party advertising cookies.",
  },
  {
    h: "Contact us",
    body: "For privacy-related questions or requests, contact us at hello@proposability.com or visit www.proposability.com",
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subline="Sightline by Propos'Ability"
      placeholder={{
        p1: "This privacy policy is currently being finalized by legal counsel. A complete policy will be published before Sightline's full public launch.",
        p2: "In the meantime, here is a summary of how Sightline handles your information:",
      }}
      sections={sections}
    />
  );
}