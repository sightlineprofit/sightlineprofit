import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

const C = {
  charcoal: "#2C2C2C",
  cream: "#FAF7F2",
  linen: "#F0EBE3",
  gold: "#B8860B",
  goldLight: "#C59845",
  sage: "#5C8A6E",
  terra: "#C4714A",
  muted: "#6B6259",
  mutedLight: "#8A7F75",
};
const FONT_DISPLAY = "'Cormorant Garamond', serif";
const FONT_SANS = "'Jost', sans-serif";

function useIsMobile(bp = 960) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [bp]);
  return m;
}

function LogoMark() {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        background: C.charcoal,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="2" y1="8" x2="14" y2="8" stroke="#B8860B" strokeWidth="1.2" />
        <circle cx="5" cy="5.5" r="1.2" stroke="#B8860B" strokeWidth="0.8" fill="none" />
        <circle cx="8" cy="3.5" r="1.2" stroke="#B8860B" strokeWidth="0.8" fill="none" />
        <circle cx="11" cy="4.5" r="1.2" stroke="#B8860B" strokeWidth="0.8" fill="none" />
        <line x1="5" y1="8" x2="5" y2="6.7" stroke="#B8860B" strokeWidth="0.8" strokeDasharray="1.5 1" />
        <line x1="8" y1="8" x2="8" y2="4.7" stroke="#B8860B" strokeWidth="0.8" strokeDasharray="1.5 1" />
        <line x1="11" y1="8" x2="11" y2="5.7" stroke="#B8860B" strokeWidth="0.8" strokeDasharray="1.5 1" />
        <circle cx="8" cy="8" r="1.8" fill="#FAF7F2" stroke="#B8860B" strokeWidth="0.9" />
        <circle cx="8" cy="8" r="0.8" fill="#B8860B" />
      </svg>
    </div>
  );
}

function Nav({ isMobile }: { isMobile: boolean }) {
  const [signInH, setSignInH] = useState(false);
  const [ctaH, setCtaH] = useState(false);
  const linkStyle: React.CSSProperties = {
    fontFamily: FONT_SANS,
    fontSize: 13,
    fontWeight: 400,
    color: C.muted,
    textDecoration: "none",
    transition: "color .15s",
  };
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        padding: isMobile ? "0 20px" : "0 48px",
        background: "rgba(250,247,242,0.96)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "0.5px solid rgba(44,44,44,0.10)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.charcoal }}>
        <LogoMark />
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 400, letterSpacing: "0.02em" }}>
          Sightline
        </span>
      </Link>
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="/#features" style={linkStyle}>Features</a>
          <a href="/#how-it-works" style={linkStyle}>How it works</a>
          <a href="/#pricing" style={linkStyle}>Pricing</a>
          <a href="/#faq" style={linkStyle}>FAQ</a>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link
          to="/login"
          onMouseEnter={() => setSignInH(true)}
          onMouseLeave={() => setSignInH(false)}
          style={{
            padding: "8px 18px",
            border: `1px solid ${signInH ? C.charcoal : "rgba(44,44,44,0.15)"}`,
            borderRadius: 6,
            fontFamily: FONT_SANS,
            fontSize: 13,
            fontWeight: 500,
            color: C.charcoal,
            textDecoration: "none",
            transition: "border-color .15s",
          }}
        >
          Sign in
        </Link>
        <Link
          to="/register"
          onMouseEnter={() => setCtaH(true)}
          onMouseLeave={() => setCtaH(false)}
          style={{
            padding: "8px 20px",
            background: C.charcoal,
            color: C.cream,
            borderRadius: 6,
            fontFamily: FONT_SANS,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            opacity: ctaH ? 0.85 : 1,
            transition: "opacity .15s",
          }}
        >
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

function Footer({ isMobile }: { isMobile: boolean }) {
  const heading: React.CSSProperties = {
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "rgba(255,255,255,0.3)",
    marginBottom: 12,
  };
  const linkStyle: React.CSSProperties = {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    textDecoration: "none",
    display: "block",
    marginBottom: 8,
    transition: "color .15s",
  };
  return (
    <footer
      style={{
        background: C.charcoal,
        borderTop: "0.5px solid rgba(255,255,255,0.07)",
        padding: isMobile ? "32px 24px" : "40px 48px",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr auto auto auto",
          gap: isMobile ? 32 : 48,
          alignItems: "start",
        }}
      >
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
            Sightline · by Propos'Ability
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
            Financial Architecture for Designers™
            <br />© 2026 Propos'Ability. All rights reserved.
          </div>
        </div>
        <div>
          <div style={heading}>Product</div>
          <a href="/#features" style={linkStyle}>Features</a>
          <a href="/#pricing" style={linkStyle}>Pricing</a>
          <a href="/#how-it-works" style={linkStyle}>How it works</a>
          <a href="/#faq" style={linkStyle}>FAQ</a>
        </div>
        <div>
          <div style={heading}>Resources</div>
          <a href="/knowledge" style={linkStyle}>Knowledge base</a>
          <a href="https://www.proposability.com/financially-designed" target="_blank" rel="noopener noreferrer" style={linkStyle}>Blog</a>
          <a href="https://www.proposability.com" target="_blank" rel="noopener noreferrer" style={linkStyle}>Financial Architecture for Designers™</a>
        </div>
        <div>
          <div style={heading}>Company</div>
          <a href="https://www.proposability.com/about" target="_blank" rel="noopener noreferrer" style={linkStyle}>About Propos'Ability</a>
          <a href="mailto:hello@proposability.com" style={linkStyle}>Contact</a>
          <a href="/privacy" style={linkStyle}>Privacy Policy</a>
          <a href="/terms" style={linkStyle}>Terms of Service</a>
        </div>
      </div>
      <div
        style={{
          maxWidth: 1120,
          margin: "32px auto 0",
          paddingTop: 20,
          borderTop: "0.5px solid rgba(255,255,255,0.07)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexDirection: isMobile ? "column" : "row",
          textAlign: isMobile ? "center" : "left",
          fontFamily: FONT_SANS,
          fontSize: 12,
          color: "rgba(255,255,255,0.2)",
        }}
      >
        <span>© 2026 Propos'Ability · Financial Architecture for Designers™</span>
        <span>hello@proposability.com</span>
      </div>
    </footer>
  );
}

export type LegalSection = { h: string; body: React.ReactNode };

export function LegalPage({
  title,
  subline,
  placeholder,
  sections,
}: {
  title: string;
  subline: string;
  placeholder: { p1: string; p2: string };
  sections: LegalSection[];
}) {
  const isMobile = useIsMobile(960);
  return (
    <div
      style={{
        background: C.cream,
        color: C.charcoal,
        fontFamily: FONT_SANS,
        fontSize: 15,
        lineHeight: 1.7,
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
        minHeight: "100vh",
      }}
    >
      <Nav isMobile={isMobile} />
      <main
        style={{
          padding: isMobile ? "104px 20px 72px" : "120px 48px 96px",
          background: C.cream,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Link
            to="/"
            style={{
              fontFamily: FONT_SANS,
              fontSize: 13,
              color: C.mutedLight,
              textDecoration: "none",
              display: "inline-block",
              marginBottom: 20,
            }}
          >
            ← Back to Sightline
          </Link>
          <div
            style={{
              display: "inline-flex",
              padding: "5px 12px",
              background: "rgba(184,134,11,0.08)",
              border: "1px solid rgba(184,134,11,0.2)",
              borderRadius: 100,
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 500,
              color: C.gold,
              marginBottom: 16,
            }}
          >
            Last updated: July 2026
          </div>
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 48,
              fontWeight: 400,
              color: C.charcoal,
              marginBottom: 8,
              marginTop: 0,
              lineHeight: 1.1,
            }}
          >
            {title}
          </h1>
          <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.mutedLight, marginBottom: 48 }}>
            {subline}
          </div>
          <div
            style={{
              background: "rgba(184,134,11,0.07)",
              border: "1px solid rgba(184,134,11,0.2)",
              borderRadius: 8,
              padding: "20px 24px",
              marginBottom: 48,
            }}
          >
            <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.charcoal, lineHeight: 1.7 }}>
              {placeholder.p1}
            </div>
            <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.muted, lineHeight: 1.7, marginTop: 8 }}>
              {placeholder.p2}
            </div>
          </div>
          {sections.map((s, i) => (
            <div key={s.h}>
              {i > 0 && (
                <div
                  style={{
                    height: "0.5px",
                    background: "rgba(44,44,44,0.10)",
                    margin: "32px 0 0",
                  }}
                />
              )}
              <h3
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 22,
                  fontWeight: 400,
                  color: C.charcoal,
                  marginTop: 36,
                  marginBottom: 8,
                }}
              >
                {s.h}
              </h3>
              <p
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 15,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.8,
                  margin: 0,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </main>
      <Footer isMobile={isMobile} />
    </div>
  );
}