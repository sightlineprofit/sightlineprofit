import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/legal/LegalShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Sightline by Propos'Ability" },
      {
        name: "description",
        content:
          "The terms governing your use of Sightline by Propos'Ability.",
      },
      { property: "og:title", content: "Terms of Service — Sightline by Propos'Ability" },
      {
        property: "og:description",
        content:
          "The terms governing your use of Sightline by Propos'Ability.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "/terms" }],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    h: "Your account",
    body: "By creating a Sightline account, you agree to provide accurate information and to keep your login credentials secure. You are responsible for all activity that occurs under your account. You must be 18 or older to use Sightline.",
  },
  {
    h: "Free trial",
    body: "Sightline offers a 27-day free trial. A valid payment method is required to start the trial but will not be charged until the trial period ends. You may cancel at any time before the trial ends to avoid being charged. One trial per person.",
  },
  {
    h: "Subscription and billing",
    body: "After your trial, Sightline is billed monthly or annually at the rate selected at signup. Founding firm pricing is locked permanently for early access members and will not increase as long as the subscription remains active. Subscriptions renew automatically at the end of each billing period until cancelled.",
  },
  {
    h: "Cancellation",
    body: "You may cancel your subscription at any time from your account settings. Cancellation takes effect at the end of the current billing period — you retain access until that date. No refunds are issued for partial billing periods.",
  },
  {
    h: "Your data",
    body: "You own your data. Sightline does not claim ownership of any financial information, project data, or firm information you enter. Upon cancellation, your data is retained for 30 days and then permanently deleted upon request or automatically thereafter.",
  },
  {
    h: "Intellectual property",
    body: "Sightline, Propos'Ability, and Financial Architecture for Designers™ are trademarks of Propos'Ability. The Sightline platform, its code, design, methodology, and content are protected by copyright and other intellectual property laws. You may not copy, reverse engineer, or build competing products using Sightline's methodology or implementation.",
  },
  {
    h: "Acceptable use",
    body: "You agree not to use Sightline in any way that violates applicable laws, infringes on the rights of others, or attempts to gain unauthorized access to any system or data. We reserve the right to suspend or terminate accounts that violate these terms.",
  },
  {
    h: "Limitation of liability",
    body: "Sightline provides financial visibility tools for informational purposes only. It does not constitute financial, legal, or accounting advice. Consult a qualified professional for advice specific to your situation. Propos'Ability's liability is limited to the amount paid for the service in the 12 months prior to any claim.",
  },
  {
    h: "Changes to these terms",
    body: "We may update these terms from time to time. We will notify active subscribers of material changes by email at least 14 days before they take effect. Continued use of Sightline after that date constitutes acceptance of the updated terms.",
  },
  {
    h: "Contact us",
    body: "For questions about these terms, contact us at hello@proposability.com or visit www.proposability.com",
  },
];

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      subline="Sightline by Propos'Ability"
      placeholder={{
        p1: "These Terms of Service are currently being finalized by legal counsel. Complete terms will be published before Sightline's full public launch.",
        p2: "In the meantime, here are the key terms governing your use of Sightline:",
      }}
      sections={sections}
    />
  );
}