import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sightline — Know what to charge. Track what you earn. Grow with confidence." },
      {
        name: "description",
        content:
          "Sightline is the financial architecture system built exclusively for interior design firm owners. Know your aligned rate, track project profitability, and plan capacity — all in one place.",
      },
      {
        property: "og:title",
        content: "Sightline — Know what to charge. Track what you earn. Grow with confidence.",
      },
      {
        property: "og:description",
        content:
          "Sightline is the financial architecture system built exclusively for interior design firm owners. Know your aligned rate, track project profitability, and plan capacity — all in one place.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

/* ============ TOKENS ============ */
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
  border: "rgba(44,44,44,0.10)",
  borderMed: "rgba(44,44,44,0.15)",
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

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function HomePage() {
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
      <Hero isMobile={isMobile} />
      <SocialProof />
      <Problem isMobile={isMobile} />
      <Features isMobile={isMobile} />
      <HowItWorks isMobile={isMobile} />
      <Testimonials isMobile={isMobile} />
      <Pricing isMobile={isMobile} />
      <FAQ />
      <FinalCTA isMobile={isMobile} />
      <Footer isMobile={isMobile} />
    </div>
  );
}

/* ============ NAV ============ */
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

function NavLink({ id, children }: { id: string; children: React.ReactNode }) {
  const [h, setH] = useState(false);
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        scrollTo(id);
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontFamily: FONT_SANS,
        fontSize: 13,
        fontWeight: 400,
        color: h ? C.charcoal : C.muted,
        textDecoration: "none",
        transition: "color .15s",
      }}
    >
      {children}
    </a>
  );
}

function Nav({ isMobile }: { isMobile: boolean }) {
  const [signInHover, setSignInHover] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);
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
      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          textDecoration: "none",
          color: C.charcoal,
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 19,
            fontWeight: 400,
            letterSpacing: "0.02em",
          }}
        >
          Sightline
        </span>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.mutedLight,
          }}
        >
          by Propos'Ability
        </span>
      </Link>

      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <NavLink id="features">Features</NavLink>
          <NavLink id="how-it-works">How it works</NavLink>
          <NavLink id="pricing">Pricing</NavLink>
          <NavLink id="faq">FAQ</NavLink>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link
          to="/login"
          onMouseEnter={() => setSignInHover(true)}
          onMouseLeave={() => setSignInHover(false)}
          style={{
            padding: "8px 18px",
            background: "transparent",
            border: `1px solid ${signInHover ? C.charcoal : "rgba(44,44,44,0.15)"}`,
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
          onMouseEnter={() => setCtaHover(true)}
          onMouseLeave={() => setCtaHover(false)}
          style={{
            padding: "8px 20px",
            background: C.charcoal,
            color: C.cream,
            borderRadius: 6,
            fontFamily: FONT_SANS,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
            opacity: ctaHover ? 0.85 : 1,
            transition: "opacity .15s",
          }}
        >
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

/* ============ HERO ============ */
function Hero({ isMobile }: { isMobile: boolean }) {
  const [pHover, setPHover] = useState(false);
  const [gHover, setGHover] = useState(false);
  return (
    <section
      style={{
        padding: isMobile ? "112px 20px 72px" : "140px 48px 100px",
        background: C.cream,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* grid */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.035,
          backgroundImage:
            "linear-gradient(#2C2C2C 1px, transparent 1px), linear-gradient(90deg, #2C2C2C 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          pointerEvents: "none",
        }}
      />
      {/* gold glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -200,
          right: -100,
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(184,134,11,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            background: "rgba(184,134,11,0.08)",
            border: "1px solid rgba(184,134,11,0.2)",
            borderRadius: 100,
            fontFamily: FONT_SANS,
            fontSize: 12,
            fontWeight: 500,
            color: C.gold,
            marginBottom: 28,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold }} />
          Built exclusively for interior design firms
        </div>

        {/* H1 */}
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: "clamp(44px, 5.5vw, 76px)",
            fontWeight: 300,
            lineHeight: 1.04,
            color: C.charcoal,
            maxWidth: 800,
            letterSpacing: "-0.02em",
            marginBottom: 24,
            marginTop: 0,
          }}
        >
          Finally know{" "}
          <em style={{ color: C.gold, fontStyle: "italic" }}>what to charge,</em>
          <br />
          whether you're profitable,
          <br />
          and when you can grow.
        </h1>

        {/* subhead */}
        <p
          style={{
            fontFamily: FONT_SANS,
            fontSize: 17,
            fontWeight: 400,
            color: C.muted,
            lineHeight: 1.75,
            maxWidth: 560,
            marginBottom: 40,
            marginTop: 0,
          }}
        >
          Sightline is the financial architecture system that answers the four questions
          every interior design firm owner is asking — but almost none can answer.{" "}
          <span style={{ fontWeight: 500, color: C.charcoal }}>One platform. Real numbers.</span>
        </p>

        {/* buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <Link
            to="/register"
            onMouseEnter={() => setPHover(true)}
            onMouseLeave={() => setPHover(false)}
            style={{
              padding: "14px 32px",
              background: C.charcoal,
              color: C.cream,
              border: "none",
              borderRadius: 8,
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              opacity: pHover ? 0.85 : 1,
              transition: "opacity .15s",
            }}
          >
            Start your free trial →
          </Link>
          <button
            onClick={() => scrollTo("features")}
            onMouseEnter={() => setGHover(true)}
            onMouseLeave={() => setGHover(false)}
            style={{
              padding: "14px 28px",
              background: "transparent",
              border: `1px solid ${gHover ? C.charcoal : "rgba(44,44,44,0.15)"}`,
              borderRadius: 8,
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: 500,
              color: C.charcoal,
              cursor: "pointer",
              transition: "border-color .15s",
            }}
          >
            See how it works
          </button>
        </div>

        {/* trust bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 13,
            color: C.mutedLight,
            fontFamily: FONT_SANS,
          }}
        >
          {[
            "14-day free trial",
            "No credit card required to explore",
            "Founding rate locked at signup",
            "Cancel anytime",
          ].map((t) => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: C.sage, fontWeight: 600 }}>✓</span> {t}
            </span>
          ))}
        </div>

        {!isMobile && <HeroDashboard />}
      </div>
    </section>
  );
}

function HeroDashboard() {
  return (
    <div
      style={{
        marginTop: 72,
        background: C.charcoal,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow:
          "0 40px 100px rgba(44,44,44,0.25), 0 10px 30px rgba(44,44,44,0.12)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* chrome */}
      <div
        style={{
          background: "rgba(0,0,0,0.5)",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
          gap: 7,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.terra, opacity: 0.7 }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.gold, opacity: 0.6 }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.sage, opacity: 0.6 }} />
        <span
          style={{
            marginLeft: 12,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 4,
            padding: "3px 14px",
            fontFamily: FONT_SANS,
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
          }}
        >
          sightline.app/dashboard
        </span>
      </div>

      {/* body */}
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 14,
        }}
      >
        <RatePanel />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <HoursTile />
          <ProjectsTile />
          <ActionTile />
        </div>
      </div>
    </div>
  );
}

function RatePanel() {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          color: "rgba(197,152,69,0.7)",
          marginBottom: 10,
        }}
      >
        RATE ARCHITECTURE · YOUR FINANCIAL FLOOR
      </div>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 300, color: "#fff", lineHeight: 1 }}>
          $311
        </span>
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>/hr</span>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 10,
            fontWeight: 500,
            padding: "3px 9px",
            borderRadius: 3,
            marginLeft: 10,
            background: "rgba(196,113,74,0.18)",
            color: "#E08060",
          }}
        >
          Below break-even
        </span>
      </div>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 10,
          color: "rgba(255,255,255,0.25)",
          marginTop: 5,
          marginBottom: 14,
        }}
      >
        Your aligned rate. The minimum your cost structure requires.
      </div>

      <div
        style={{
          border: "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 5,
          overflow: "hidden",
          marginBottom: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {[
          { label: "YOUR RATE", val: "$175", valColor: "#C4714A", sub: "−$136/hr below floor", subColor: C.terra },
          { label: "BREAK-EVEN", val: "$242", valColor: "rgba(255,255,255,0.7)", sub: "Cost-only floor", subColor: "rgba(255,255,255,0.35)" },
          { label: "MARGIN TARGET", val: "22%", valColor: "rgba(255,255,255,0.7)", sub: "$69/hr margin", subColor: "rgba(255,255,255,0.35)" },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "10px 12px",
              borderLeft: i === 0 ? "none" : "0.5px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              style={{
                fontFamily: FONT_SANS,
                fontSize: 8,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "rgba(255,255,255,0.35)",
              }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: s.valColor, marginTop: 2 }}>{s.val}</div>
            <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: s.subColor, marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* position bar */}
      <div
        style={{
          height: 6,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 3,
          position: "relative",
          margin: "12px 0 6px",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "56%",
            height: 6,
            background: "rgba(196,113,74,0.4)",
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "56%",
            top: -3,
            width: 2,
            height: 12,
            background: "#C4714A",
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: -3,
            width: 2,
            height: 12,
            background: "rgba(197,152,69,0.6)",
          }}
        />
      </div>

      <div
        style={{
          background: "rgba(196,113,74,0.08)",
          borderLeft: "2px solid #C4714A",
          borderRadius: "0 4px 4px 0",
          padding: "8px 12px",
          marginTop: 10,
          fontFamily: FONT_SANS,
          fontSize: 10,
          color: "rgba(255,255,255,0.5)",
          lineHeight: 1.6,
        }}
      >
        At $175/hr you're leaving $97,920/yr in potential revenue on the table — based on
        720 billable hours annually.
      </div>
    </div>
  );
}

const tileWrap: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(255,255,255,0.07)",
  borderRadius: 7,
  padding: "12px 14px",
};
const tileLabel: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 8,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  color: "rgba(255,255,255,0.35)",
};

function HoursTile() {
  return (
    <div style={tileWrap}>
      <div style={tileLabel}>HOURS THIS WEEK</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: "#fff" }}>18.5</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>/ 30 hrs</span>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(255,255,255,0.07)",
          borderRadius: 2,
          marginTop: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "62%", height: 3, background: C.gold }} />
      </div>
      <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: "rgba(184,134,11,0.7)", marginTop: 6 }}>
        11.5 hrs to target
      </div>
    </div>
  );
}

function ProjectsTile() {
  return (
    <div style={tileWrap}>
      <div style={tileLabel}>ACTIVE PROJECTS</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: "#fff", marginTop: 2 }}>4</div>
      <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
        <span style={{ color: C.sage }}>●</span> 2 healthy ·{" "}
        <span style={{ color: C.gold }}>●</span> 1 watch ·{" "}
        <span style={{ color: C.terra }}>●</span> 1 at risk
      </div>
    </div>
  );
}

function ActionTile() {
  const items = [
    {
      bg: "#C4714A",
      color: "#E08060",
      n: "1",
      text: "Raise your rate to $311/hr on your next new client proposal",
    },
    {
      bg: C.gold,
      color: "#C59845",
      n: "2",
      text: "Tell your 4 active clients your rate increases in 90 days",
    },
    {
      bg: "rgba(255,255,255,0.07)",
      color: "rgba(255,255,255,0.5)",
      n: "3",
      text: "Calculate what last 3 projects earned at $311/hr",
    },
  ];
  return (
    <div
      style={{
        ...tileWrap,
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ ...tileLabel, color: "rgba(197,152,69,0.6)", marginBottom: 6 }}>
        YOUR MOST LEVERAGED ACTION
      </div>
      {items.map((it, i) => (
        <div
          key={it.n}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 7,
            padding: "5px 0",
            borderBottom: i < items.length - 1 ? "0.5px solid rgba(255,255,255,0.05)" : "none",
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: it.bg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: FONT_SANS,
              fontSize: 8,
              color: it.color,
              fontWeight: 600,
            }}
          >
            {it.n}
          </span>
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 9,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.5,
            }}
          >
            {it.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============ SOCIAL PROOF ============ */
function SocialProof() {
  const stats = [
    { n: "$311", l: "avg aligned rate revealed" },
    { n: "$72k", l: "avg annual gap at $100/hr" },
    { n: "14 days", l: "free trial, full access" },
    { n: "5 min", l: "to see your aligned rate" },
  ];
  return (
    <section
      style={{
        background: C.linen,
        borderTop: "0.5px solid rgba(44,44,44,0.10)",
        borderBottom: "0.5px solid rgba(44,44,44,0.10)",
        padding: "20px 48px",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 12,
            fontWeight: 500,
            color: C.mutedLight,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            maxWidth: 360,
          }}
        >
          Built for design firms by a financial architect who's been inside hundreds of them
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
          {stats.map((s, i) => (
            <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 40 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 400, color: C.charcoal, lineHeight: 1 }}>
                  {s.n}
                </div>
                <div style={{ fontFamily: FONT_SANS, fontSize: 11, color: C.mutedLight, marginTop: 2 }}>
                  {s.l}
                </div>
              </div>
              {i < stats.length - 1 && (
                <div style={{ width: 1, height: 32, background: C.borderMed }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ PROBLEM ============ */
function Problem({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ padding: isMobile ? "72px 20px" : "96px 48px", background: C.cream }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: C.gold,
            marginBottom: 10,
          }}
        >
          The problem
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: "clamp(30px, 4vw, 48px)",
            fontWeight: 300,
            lineHeight: 1.12,
            color: C.charcoal,
            margin: 0,
          }}
        >
          You're fully booked.
          <br />
          Doing beautiful work.
          <br />
          <em style={{ color: C.gold, fontStyle: "italic" }}>
            Wondering where the money went.
          </em>
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 40 : 80,
            alignItems: "center",
            marginTop: 52,
          }}
        >
          <div>
            <blockquote
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: "clamp(22px, 3vw, 34px)",
                fontWeight: 300,
                fontStyle: "italic",
                color: C.charcoal,
                lineHeight: 1.4,
                borderLeft: `3px solid ${C.gold}`,
                paddingLeft: 24,
                margin: "0 0 24px 0",
              }}
            >
              "I finished my most successful year yet and still couldn't figure out why the
              account didn't reflect the effort."
            </blockquote>
            {[
              <>Most interior designers run their firms on instinct, industry averages, and a rate they picked years ago and haven't revisited since. They have accounting software that records what happened. They have project management tools that track what's in progress.</>,
              <>But <strong style={{ fontWeight: 500, color: C.charcoal }}>nothing tells them what to charge</strong>, whether the projects they're delivering are actually profitable against what those hours cost, or whether the firm's structure can support the growth they're planning.</>,
              <>That's not a hustle problem. It's a visibility problem. The numbers have always been there. <strong style={{ fontWeight: 500, color: C.charcoal }}>Nobody built the tool that showed them to designers.</strong></>,
              <>Until now.</>,
            ].map((body, i, arr) => (
              <p
                key={i}
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 15,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.8,
                  marginBottom: i === arr.length - 1 ? 0 : 16,
                  marginTop: 0,
                }}
              >
                {body}
              </p>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <PainCard
              iconBg="rgba(196,113,74,0.10)"
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#C4714A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="13" x2="17" y2="13" />
                  <path d="M8 10c0-1.1.9-2 2-2s2 .9 2 2c0 1-1 1.5-2 2v1" />
                  <circle cx="10" cy="16.5" r="0.5" fill="#C4714A" stroke="none" />
                </svg>
              }
              title="Pricing from instinct, not data"
              body="Most designers charge what feels right or what the market seems to support — without knowing whether that rate covers what the firm actually costs to run."
            />
            <PainCard
              iconBg="rgba(184,134,11,0.10)"
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="8" width="4" height="9" rx="0.5" />
                  <rect x="8" y="4" width="4" height="13" rx="0.5" />
                  <rect x="14" y="6" width="4" height="11" rx="0.5" />
                  <line x1="16" y1="2" x2="16" y2="8" />
                  <polyline points="14,6 16,8 18,6" />
                </svg>
              }
              title="Profitable-looking projects that aren't"
              body="The invoice was paid. But when time overruns are accounted for against the firm's real cost per hour, the project lost money — invisibly."
            />
            <PainCard
              iconBg="rgba(92,138,110,0.10)"
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#5C8A6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="16" height="14" rx="1.5" />
                  <line x1="2" y1="8" x2="18" y2="8" />
                  <line x1="6" y1="2" x2="6" y2="6" />
                  <line x1="14" y1="2" x2="14" y2="6" />
                  <line x1="7" y1="12" x2="13" y2="16" />
                  <line x1="13" y1="12" x2="7" y2="16" />
                </svg>
              }
              title="Saying yes without knowing if there's room"
              body="Capacity is managed by feel. New projects get added until something breaks — quality, delivery, or the designer herself."
            />
            <PainCard
              iconBg="rgba(44,44,44,0.06)"
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="10" y1="16" x2="10" y2="5" />
                  <polyline points="6,9 10,5 14,9" />
                  <path d="M7 13.5c0-1.1.9-2 2-2h2 c.6 0 1 .4 1 1s-.4 1-1 1h-1v1.5" />
                  <circle cx="10" cy="18" r="0.5" fill="#2C2C2C" stroke="none" />
                </svg>
              }
              title="Growth decisions made without the numbers"
              body="Hiring feels necessary. But the financial reality of whether the firm can support it — before the commitment is made — is rarely visible."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PainCard({
  iconBg,
  icon,
  title,
  body,
}: {
  iconBg: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        background: C.linen,
        border: "1px solid rgba(44,44,44,0.10)",
        borderRadius: 10,
        padding: "20px 22px",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: iconBg,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 14,
            fontWeight: 500,
            color: C.charcoal,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 13,
            fontWeight: 400,
            color: C.muted,
            lineHeight: 1.65,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
/* ============ FEATURES ============ */
const featureH3: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: "clamp(26px, 3vw, 38px)",
  fontWeight: 300,
  lineHeight: 1.2,
  color: C.charcoal,
  marginBottom: 16,
  marginTop: 0,
};
const featureBody: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 15,
  fontWeight: 400,
  color: C.muted,
  lineHeight: 1.8,
  marginBottom: 24,
  marginTop: 0,
};
const featureTag: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  background: "rgba(184,134,11,0.08)",
  borderRadius: 100,
  fontFamily: FONT_SANS,
  fontSize: 11,
  fontWeight: 600,
  color: C.gold,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 16,
};
function StrongInline({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 500, color: C.charcoal }}>{children}</strong>;
}
function PointList({ items }: { items: React.ReactNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(92,138,110,0.12)",
              color: C.sage,
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            ✓
          </span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            {t}
          </span>
        </div>
      ))}
    </div>
  );
}
function VisualShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        background: C.charcoal,
        boxShadow: "0 20px 60px rgba(44,44,44,0.15)",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          padding: "10px 14px",
          display: "flex",
          gap: 6,
          borderBottom: "0.5px solid rgba(255,255,255,0.05)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.terra, opacity: 0.6 }} />
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold, opacity: 0.5 }} />
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.sage, opacity: 0.5 }} />
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function FeatureBlock({
  isMobile,
  reversed,
  first,
  text,
  visual,
}: {
  isMobile: boolean;
  reversed: boolean;
  first?: boolean;
  text: React.ReactNode;
  visual: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 40 : 80,
        alignItems: "center",
        padding: first ? "0 0 80px" : "80px 0",
        borderTop: first ? "none" : "0.5px solid rgba(44,44,44,0.10)",
        direction: !isMobile && reversed ? "rtl" : "ltr",
      }}
    >
      <div style={{ direction: "ltr" }}>{text}</div>
      <div style={{ direction: "ltr" }}>{visual}</div>
    </div>
  );
}

function BuildingStackVisual() {
  const blocks = [
    { h: 44, bg: "#8B6914", label: "Margin", amt: "+$69/hr" },
    { h: 50, bg: "#C4714A", label: "Billable hours", amt: "720/yr" },
    { h: 44, bg: "#3D4A3F", label: "Team cost", amt: "$64k/yr" },
    { h: 40, bg: "#4A3F35", label: "Operating expenses", amt: "$28k/yr" },
    { h: 52, bg: "#2C2C2C", label: "Owner compensation", amt: "$82k/yr" },
  ];
  return (
    <VisualShell>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "rgba(197,152,69,0.6)",
          marginBottom: 10,
        }}
      >
        YOUR RATE IS A BUILDING
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              height: b.h,
              background: b.bg,
              borderRadius: i === blocks.length - 1 ? "0 0 2px 2px" : 2,
            }}
          >
            <span
              style={{
                fontFamily: FONT_SANS,
                fontSize: 10,
                fontWeight: 500,
                color: "rgba(255,255,255,0.8)",
                letterSpacing: "0.04em",
              }}
            >
              {b.label}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: FONT_DISPLAY,
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
              }}
            >
              {b.amt}
            </span>
          </div>
        ))}
      </div>
      <div style={{ height: 1.5, background: "rgba(255,255,255,0.3)", marginBottom: 5 }} />
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.3)",
          textAlign: "center",
        }}
      >
        COST FLOOR
      </div>
      <div
        style={{
          background: "rgba(184,134,11,0.12)",
          border: "0.5px solid rgba(184,134,11,0.3)",
          borderRadius: 4,
          padding: "12px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              color: "rgba(197,152,69,0.8)",
            }}
          >
            ALIGNED RATE
          </div>
          <div style={{ fontFamily: FONT_SANS, fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
            Your minimum floor
          </div>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: "#fff" }}>$311/hr</div>
      </div>
    </VisualShell>
  );
}

function ProjectCardsVisual() {
  return (
    <VisualShell>
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderLeft: `3px solid ${C.sage}`,
          borderRadius: 6,
          padding: "14px 16px",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: "#fff" }}>Henderson Residence</span>
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 9,
              background: "rgba(92,138,110,0.15)",
              color: C.sage,
              padding: "2px 7px",
              borderRadius: 2,
            }}
          >
            Active
          </span>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 8, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 8, marginBottom: 3, letterSpacing: "0.15em" }}>
          REMAINING MARGIN
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.sage }}>$38,420</div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2, marginBottom: 8 }}>
          of $45,000 fee · 14% consumed · 91 hrs remaining
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
          <div style={{ width: "14%", height: 4, background: C.sage, borderRadius: 2 }} />
        </div>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderLeft: `3px solid ${C.gold}`,
          borderRadius: 6,
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: "#fff" }}>Morrison Kitchen</span>
          <span
            style={{
              fontFamily: FONT_SANS,
              fontSize: 9,
              background: "rgba(184,134,11,0.12)",
              color: C.gold,
              padding: "2px 7px",
              borderRadius: 2,
            }}
          >
            Needs update
          </span>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 8, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 8, marginBottom: 3, letterSpacing: "0.15em" }}>
          REMAINING MARGIN · <span style={{ color: C.gold }}>estimate only</span>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: C.gold }}>
          $12,840<sup style={{ fontSize: 14 }}>?</sup>
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: C.gold, marginTop: 2, marginBottom: 8 }}>
          No time logged in 9 days. Actual may be lower.
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
          <div style={{ width: "68%", height: 4, background: C.gold, borderRadius: 2 }} />
        </div>
      </div>
    </VisualShell>
  );
}

function CapacityVisual() {
  const capData = [12, 16, 20, 26, 30, 34, 36, 32, 26, 20, 14, 10, 18, 24, 16, 12];
  const capTarget = 30;
  const capMaxH = 48;
  return (
    <VisualShell>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "rgba(255,255,255,0.3)",
          marginBottom: 10,
        }}
      >
        WEEKLY PRESSURE — NEXT 16 WEEKS
      </div>
      <div
        style={{
          height: 70,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 4,
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          padding: "6px 8px 0",
          position: "relative",
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: `${(capTarget / capMaxH) * 100}%`,
            height: 1,
            borderTop: "1px dashed rgba(255,255,255,0.15)",
          }}
        />
        {capData.map((w, i) => {
          const color =
            w >= capTarget ? C.terra : w >= capTarget * 0.8 ? C.gold : C.sage;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${Math.min(w / capMaxH, 1) * 100}%`,
                background: color,
                borderRadius: "1px 1px 0 0",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {[
          { c: C.sage, l: "Within target" },
          { c: C.gold, l: "Approaching" },
          { c: C.terra, l: "Over" },
        ].map((x) => (
          <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 1, background: x.c }} />
            <span style={{ fontFamily: FONT_SANS, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{x.l}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { p: "NOW — JULY", h: "~210 hrs", d: "Room for a mid-size engagement", c: C.sage },
          { p: "AUG — SEP", h: "~95 hrs", d: "Limited — small scope only", c: C.gold },
          { p: "OCT — DEC", h: "~280 hrs", d: "Best window for large work", c: C.sage },
        ].map((w) => (
          <div
            key={w.p}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 4,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontFamily: FONT_SANS, fontSize: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: w.c }}>{w.p}</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 300, color: w.c }}>{w.h}</div>
            <div style={{ fontFamily: FONT_SANS, fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2, lineHeight: 1.4 }}>{w.d}</div>
          </div>
        ))}
      </div>
    </VisualShell>
  );
}

function TeamCapacityVisual() {
  const members = [
    {
      dot: C.gold,
      role: "Principal",
      badge: "No entry this week",
      badgeBg: "rgba(184,134,11,0.12)",
      badgeColor: C.goldLight,
      target: "30 hrs",
      thisWeek: "0 hrs",
      thisWeekColor: C.terra,
      status: "Not started",
      statusBg: "rgba(196,113,74,0.15)",
      statusColor: C.terra,
      pct: 0,
      barColor: C.terra,
    },
    {
      dot: C.sage,
      role: "Jr Designer",
      badge: "Up to date",
      badgeBg: "rgba(92,138,110,0.15)",
      badgeColor: C.sage,
      target: "20 hrs",
      thisWeek: "18 hrs",
      thisWeekColor: C.sage,
      status: "On track",
      statusBg: "rgba(92,138,110,0.15)",
      statusColor: C.sage,
      pct: 90,
      barColor: C.sage,
    },
  ];
  return (
    <VisualShell>
      <div
        style={{
          fontFamily: FONT_SANS,
          fontSize: 8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "rgba(197,152,69,0.6)",
          marginBottom: 10,
        }}
      >
        FIRM CAPACITY — TEAM OVERVIEW
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: "#fff" }}>Getting full</span>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 9,
            fontWeight: 500,
            padding: "3px 9px",
            borderRadius: 3,
            background: "rgba(184,134,11,0.15)",
            color: C.goldLight,
          }}
        >
          78% committed
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {members.map((m) => (
          <div
            key={m.role}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 5,
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot }} />
                <span style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{m.role}</span>
              </span>
              <span
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 9,
                  background: m.badgeBg,
                  color: m.badgeColor,
                  padding: "2px 6px",
                  borderRadius: 2,
                }}
              >
                {m.badge}
              </span>
            </div>
            <div
              style={{
                border: "0.5px solid rgba(255,255,255,0.07)",
                borderRadius: 3,
                overflow: "hidden",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
              }}
            >
              {[
                { l: "TARGET", v: m.target, c: "rgba(255,255,255,0.7)", pill: false },
                { l: "THIS WEEK", v: m.thisWeek, c: m.thisWeekColor, pill: false },
                { l: "STATUS", v: m.status, c: m.statusColor, pill: true, bg: m.statusBg },
              ].map((col, i) => (
                <div
                  key={col.l}
                  style={{
                    padding: "6px 8px",
                    borderLeft: i === 0 ? "none" : "0.5px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div style={{ fontFamily: FONT_SANS, fontSize: 7, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em" }}>{col.l}</div>
                  {col.pill ? (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 3,
                        fontFamily: FONT_SANS,
                        fontSize: 9,
                        padding: "1px 6px",
                        borderRadius: 2,
                        background: col.bg,
                        color: col.c,
                      }}
                    >
                      {col.v}
                    </span>
                  ) : (
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, color: col.c, marginTop: 2 }}>{col.v}</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.06)", marginTop: 6, borderRadius: 1 }}>
              <div style={{ width: `${m.pct}%`, height: 2, background: m.barColor, borderRadius: 1 }} />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.06)",
          borderRadius: 4,
          padding: "8px 12px",
        }}
      >
        <div style={{ fontFamily: FONT_SANS, fontSize: 7, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", marginBottom: 5 }}>
          FIRM THIS WEEK — COMBINED
        </div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 4 }}>
          <div style={{ width: "36%", height: 3, background: C.sage, borderRadius: 2 }} />
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
          18 of 50 hrs logged across 2 billable people
        </div>
      </div>
    </VisualShell>
  );
}

function Features({ isMobile }: { isMobile: boolean }) {
  return (
    <section id="features" style={{ padding: isMobile ? "0 20px 72px" : "0 48px 96px", background: C.cream }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <FeatureBlock
          isMobile={isMobile}
          reversed={false}
          first
          text={
            <div>
              <div style={featureTag}>Aligned rate</div>
              <h3 style={featureH3}>
                Finally know
                <br />
                <em style={{ color: C.gold, fontStyle: "italic" }}>what to charge.</em>
              </h3>
              <p style={featureBody}>
                Sightline calculates your aligned rate — the minimum hourly rate your specific cost
                structure requires. Not an industry average. Not a guess.{" "}
                <StrongInline>Your number, built from your compensation, your expenses, your team, and the hours you actually bill.</StrongInline>
              </p>
              <PointList
                items={[
                  <><StrongInline>Five-layer cost breakdown</StrongInline> — see exactly what each layer contributes per billable hour</>,
                  <><StrongInline>Real-time recalculation</StrongInline> — rate updates instantly when any input changes</>,
                  <><StrongInline>Rate history</StrongInline> — see every change and what caused it</>,
                  <><StrongInline>Gap analysis</StrongInline> — know exactly what's driving the gap and the three levers to close it</>,
                ]}
              />
            </div>
          }
          visual={<BuildingStackVisual />}
        />
        <FeatureBlock
          isMobile={isMobile}
          reversed
          text={
            <div>
              <div style={featureTag}>Project profitability</div>
              <h3 style={featureH3}>
                Know if your projects
                <br />
                <em style={{ color: C.gold, fontStyle: "italic" }}>are actually profitable.</em>
              </h3>
              <p style={featureBody}>
                Not — did the client pay the invoice. Did the project cover what it{" "}
                <StrongInline>actually cost your firm to deliver it</StrongInline>? Sightline tracks
                margin against your aligned rate in real time so you know while the project is
                open, not after you've moved on.
              </p>
              <PointList
                items={[
                  <><StrongInline>Live margin tracking</StrongInline> against your aligned rate — not just what you quoted</>,
                  <><StrongInline>Data freshness states</StrongInline> — stale time entries surface visually before the number becomes unreliable</>,
                  <><StrongInline>Hours remaining</StrongInline> — see scope burn in real time across all active projects</>,
                  <><StrongInline>Activity breakdown</StrongInline> — see exactly where hours are going by type</>,
                ]}
              />
            </div>
          }
          visual={<ProjectCardsVisual />}
        />
        <FeatureBlock
          isMobile={isMobile}
          reversed={false}
          text={
            <div>
              <div style={featureTag}>Capacity planning</div>
              <h3 style={featureH3}>
                Say yes from data,
                <br />
                <em style={{ color: C.gold, fontStyle: "italic" }}>not optimism.</em>
              </h3>
              <p style={featureBody}>
                Knowing you're at 70% capacity today tells you nothing about whether August is
                wide open or already overcommitted. Sightline maps your workload week by week so
                you know <StrongInline>exactly when you have room</StrongInline> — before you
                commit.
              </p>
              <PointList
                items={[
                  <><StrongInline>16-week pressure chart</StrongInline> — see the shape of your workload ahead at a glance</>,
                  <><StrongInline>Project timeline</StrongInline> — every active project mapped across a six-month window</>,
                  <><StrongInline>Open windows</StrongInline> — calculated dynamically from your actual project data</>,
                  <><StrongInline>What-if tool</StrongInline> — "can I take this project?" answered before you reply</>,
                ]}
              />
            </div>
          }
          visual={<CapacityVisual />}
        />
        <FeatureBlock
          isMobile={isMobile}
          reversed
          text={
            <div>
              <div style={featureTag}>Growth intelligence</div>
              <h3 style={featureH3}>
                Know when it's time
                <br />
                to grow — and <em style={{ color: C.gold, fontStyle: "italic" }}>if you can.</em>
              </h3>
              <p style={featureBody}>
                Adding a team member, taking on a larger scope, moving to a bigger studio — each
                one changes your cost floor, your aligned rate, and your capacity picture.{" "}
                <StrongInline>Sightline models both sides before you commit.</StrongInline>
              </p>
              <PointList
                items={[
                  <><StrongInline>Team cost modeling</StrongInline> — burdened labor cost calculated automatically from what you know</>,
                  <><StrongInline>Budget revenue</StrongInline> — total firm revenue potential across all billable contributors</>,
                  <><StrongInline>Per-member capacity</StrongInline> — track hours logged, targets, and utilization for every team member</>,
                  <><StrongInline>Personalized actions</StrongInline> — the highest-leverage next step for your specific firm, every session</>,
                ]}
              />
            </div>
          }
          visual={<TeamCapacityVisual />}
        />
      </div>
    </section>
  );
}

/* ============ HOW IT WORKS ============ */
function HowItWorks({ isMobile }: { isMobile: boolean }) {
  const steps = [
    { n: "01", t: "Enter your compensation target", b: "What you need to pay yourself — wages, taxes, health insurance, retirement. This is the foundation everything else sits on." },
    { n: "02", t: "Add your operating expenses", b: "Software, insurance, rent, subscriptions. Everything it costs to keep the firm running — whether you bill ten hours this week or forty." },
    { n: "03", t: "Set your capacity targets", b: "How many hours you plan to bill per week and how many weeks you work. This determines how the cost floor divides across billable hours." },
    { n: "04", t: "See your aligned rate", b: "Your financial floor — calculated from your actual inputs. Every feature in Sightline builds from this number. Add projects, log time, and the picture deepens." },
  ];
  return (
    <section
      id="how-it-works"
      style={{
        padding: isMobile ? "72px 20px" : "96px 48px",
        background: C.linen,
        borderTop: "0.5px solid rgba(44,44,44,0.10)",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: C.gold,
            marginBottom: 10,
          }}
        >
          How it works
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px,4vw,48px)", fontWeight: 300, lineHeight: 1.12, color: C.charcoal, margin: 0 }}>
          Up and running
          <br />
          <em style={{ color: C.gold, fontStyle: "italic" }}>in under 15 minutes.</em>
        </h2>
        <p style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 400, color: C.muted, lineHeight: 1.8, marginTop: 14, maxWidth: 560 }}>
          Sightline is designed to give you your aligned rate — the most important number in your
          firm — within your first session. No lengthy implementation. No data migration. Just
          your numbers, finally visible.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 2,
            background: "rgba(44,44,44,0.10)",
            border: "0.5px solid rgba(44,44,44,0.10)",
            borderRadius: 10,
            overflow: "hidden",
            marginTop: 52,
          }}
        >
          {steps.map((s) => (
            <div key={s.n} style={{ background: C.cream, padding: "32px 28px" }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 300, color: "rgba(44,44,44,0.08)", lineHeight: 1, marginBottom: 16 }}>
                {s.n}
              </div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 500, color: C.charcoal, marginBottom: 8, lineHeight: 1.3 }}>
                {s.t}
              </div>
              <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>{s.b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ TESTIMONIALS ============ */
function Testimonials({ isMobile }: { isMobile: boolean }) {
  const cards = [
    { q: "I've been in business for nine years. I had no idea my rate was below break-even until Sightline showed me the calculation. The number was shocking — and completely obvious in hindsight.", n: "Studio Principal", f: "Residential design firm · 9 years in business" },
    { q: "The capacity timeline changed how I take on new projects. I used to say yes from a feeling. Now I look at the actual open windows and have a real answer before I even get on the call.", n: "Independent Designer", f: "Solo practice · Full-service interior design" },
    { q: "I hired a junior designer last year and my profit went down. I couldn't figure out why. Sightline showed me her burdened cost wasn't being captured in my rate. Simple fix, massive impact.", n: "Studio Owner", f: "Design studio · Principal + 2 team members" },
  ];
  return (
    <section style={{ padding: isMobile ? "72px 20px" : "96px 48px", background: C.cream, borderTop: "0.5px solid rgba(44,44,44,0.10)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, marginBottom: 10 }}>
          What designers are saying
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px,4vw,48px)", fontWeight: 300, lineHeight: 1.12, color: C.charcoal, margin: 0 }}>
          The number was always there.
          <br />
          <em style={{ color: C.gold, fontStyle: "italic" }}>Now they can see it.</em>
        </h2>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontStyle: "italic", color: "#8A7F75", marginTop: 8 }}>
          Composite reflections from our beta community.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
            gap: 20,
            marginTop: 52,
          }}
        >
          {cards.map((c) => (
            <div key={c.n} style={{ background: C.linen, border: "1px solid rgba(44,44,44,0.10)", borderRadius: 10, padding: "28px 26px" }}>
              <div style={{ color: C.gold, fontSize: 14, letterSpacing: 2, marginBottom: 14 }}>★★★★★</div>
              <blockquote style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 400, fontStyle: "italic", color: C.charcoal, lineHeight: 1.6, margin: "0 0 20px" }}>
                “{c.q}”
              </blockquote>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(44,44,44,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5" r="3" fill="rgba(44,44,44,0.25)" />
                    <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="rgba(44,44,44,0.25)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, color: C.charcoal }}>{c.n}</div>
                  <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.mutedLight }}>{c.f}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ PRICING ============ */
function Pricing({ isMobile }: { isMobile: boolean }) {
  const [annual, setAnnual] = useState(false);
  const features = [
    "Aligned rate calculation",
    "Project profitability tracking",
    "Capacity timeline — 16 weeks",
    "Personalized action engine",
    "Model a change + commit to action",
    "Rate history and tracking",
    "Unlimited team members",
    "Per-member capacity tracking",
    "Activity type breakdown",
    "Budget revenue — full firm",
    "Multi-principal support",
    "Knowledge base — 8 guides",
  ];
  return (
    <section
      id="pricing"
      style={{
        padding: isMobile ? "72px 20px" : "96px 48px",
        background: C.linen,
        borderTop: "0.5px solid rgba(44,44,44,0.10)",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, marginBottom: 10 }}>
          Pricing
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px,4vw,48px)", fontWeight: 300, lineHeight: 1.12, color: C.charcoal, margin: 0 }}>
          One plan.
          <br />
          <em style={{ color: C.gold, fontStyle: "italic" }}>Everything included.</em>
        </h2>
        <p style={{ fontFamily: FONT_SANS, fontSize: 15, color: C.muted, lineHeight: 1.8, marginTop: 14 }}>
          No tiers. No feature gates. No upgrade path. Full access from day one.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "40px 0" }}>
        <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: !annual ? C.charcoal : C.muted, fontWeight: !annual ? 500 : 400 }}>
          Monthly
        </span>
        <button
          onClick={() => setAnnual((v) => !v)}
          aria-label="Toggle billing period"
          style={{
            width: 44,
            height: 24,
            background: C.charcoal,
            borderRadius: 100,
            position: "relative",
            cursor: "pointer",
            transition: "background .2s",
            border: "none",
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: annual ? 23 : 3,
              width: 18,
              height: 18,
              background: "#fff",
              borderRadius: "50%",
              transition: "left .2s",
            }}
          />
        </button>
        <span style={{ fontFamily: FONT_SANS, fontSize: 14, color: annual ? C.charcoal : C.muted, fontWeight: annual ? 500 : 400, display: "inline-flex", alignItems: "center" }}>
          Annual
          <span
            style={{
              background: C.sage,
              color: "#fff",
              fontFamily: FONT_SANS,
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 100,
              marginLeft: 6,
            }}
          >
            Save $79.98
          </span>
        </span>
      </div>

      <div
        style={{
          maxWidth: 480,
          margin: "0 auto",
          background: C.cream,
          border: "1px solid rgba(184,134,11,0.25)",
          borderRadius: 12,
          padding: isMobile ? "28px 22px" : "40px 38px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.gold, border: "1px solid rgba(184,134,11,0.25)", borderRadius: 100, padding: "4px 12px" }}>
            Early access pricing
          </span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.mutedLight }}>
            Full access · Unlimited team members
          </span>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 400, color: C.charcoal, marginBottom: 6 }}>
          Sightline by Propos'Ability
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>
          The complete financial architecture system for interior design firm owners. Know what
          to charge. Track profitability. Plan capacity. Know when to grow.
        </div>
        <div>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 64, fontWeight: 300, color: C.charcoal, lineHeight: 1 }}>
            {annual ? "$399.90" : "$39.99"}
          </span>
          <span style={{ fontFamily: FONT_SANS, fontSize: 15, color: C.mutedLight, verticalAlign: "bottom", paddingBottom: 12, marginLeft: 4 }}>
            {annual ? "/year" : "/month"}
          </span>
          {annual && (
            <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, color: C.sage, marginTop: 6 }}>
              $33.33/mo — you save $79.98 per year
            </div>
          )}
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, color: C.sage, marginTop: 8 }}>
          Founding rate — locked permanently for early access members.
        </div>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.mutedLight, marginTop: 3, marginBottom: 28 }}>
          {annual ? "After early access: $699.90/yr for new members." : "After early access: $69.99/mo for new members."}
        </div>
        <div style={{ height: "0.5px", background: "rgba(44,44,44,0.10)", margin: "0 0 24px" }} />
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.charcoal, marginBottom: 14 }}>
          Everything. No exceptions.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "8px 16px", marginBottom: 28 }}>
          {features.map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
              <span style={{ color: C.sage, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
              <span style={{ fontFamily: FONT_SANS, fontSize: 13, color: C.muted }}>{f}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => (window.location.href = "/register")}
          style={{
            width: "100%",
            background: C.charcoal,
            color: C.cream,
            padding: 15,
            borderRadius: 8,
            fontFamily: FONT_SANS,
            fontSize: 14,
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            marginBottom: 10,
          }}
        >
          Start my 14-day free trial →
        </button>
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: C.mutedLight, textAlign: "center" }}>
          No charge for 14 days · Card required to start trial · Cancel anytime
        </div>
      </div>

      <div
        style={{
          maxWidth: 480,
          margin: "20px auto 0",
          background: "rgba(92,138,110,0.07)",
          border: "1px solid rgba(92,138,110,0.20)",
          borderRadius: 8,
          padding: "16px 20px",
          fontFamily: FONT_SANS,
          fontSize: 13,
          color: C.charcoal,
          lineHeight: 1.7,
        }}
      >
        <span style={{ fontWeight: 500 }}>Founding pricing</span> is available during early
        access. Your rate locks permanently — it never increases as long as your subscription is
        active. Once early access closes, new members pay $69.99/mo or $699.90/yr.
      </div>
    </section>
  );
}

/* ============ FAQ ============ */
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const qs: { q: string; a: React.ReactNode }[] = [
    {
      q: "What is an aligned rate and how is it different from my hourly rate?",
      a: <>Your hourly rate is what you charge clients. Your aligned rate is what your firm <StrongInline>needs</StrongInline> to charge — calculated from your actual compensation, operating expenses, team costs, and billable hours. Most designers have never seen this number. For most, it's higher than what they're currently charging. The gap between the two is what Sightline is built to show you.</>,
    },
    {
      q: "Is Sightline a replacement for Studio Designer or QuickBooks?",
      a: <>No — and intentionally so. Studio Designer and QuickBooks record what happened. Sightline answers what it means and what to do next. Most designers use both: their existing tools for accounting and project management, and Sightline as their financial architecture system — understanding their rate, tracking profitability, and planning capacity. Sightline sits alongside your existing tools, not instead of them.</>,
    },
    {
      q: "How long does setup take?",
      a: <>Most designers see their aligned rate within 5–10 minutes of completing the onboarding wizard. The five-step setup asks for your compensation target, operating expenses, capacity targets, and team information. Estimates work fine at this stage — you can refine inputs anytime and the rate recalculates immediately. The more you add over time (active projects, time entries, team members), the more complete the picture becomes.</>,
    },
    {
      q: "Do I have to enter all my expenses perfectly to get value?",
      a: <>No. An aligned rate calculated from reasonable estimates is far more useful than no aligned rate at all. Start with your best approximations — your bank statement from the last 90 days is usually enough to get close on expenses. The picture gets more precise as you use the tool, not as a prerequisite to using it.</>,
    },
    {
      q: "What happens when my 14-day trial ends?",
      a: <>We'll remind you as your trial end date approaches. If you choose to continue, your card is charged at the rate you selected — $39.99/mo or $399.90/yr at founding pricing. If you decide not to continue, cancel before your trial ends and you won't be charged anything. Your data is preserved for 30 days after cancellation in case you change your mind.</>,
    },
    {
      q: "What is founding pricing and how long does it last?",
      a: <>Founding pricing is available during early access at $39.99/mo or $399.90/yr. When early access closes, new members will pay the standard rate of $69.99/mo or $699.90/yr. <StrongInline>Founding members keep their rate permanently</StrongInline> — it never increases as long as the subscription stays active. There's no expiry on the founding rate.</>,
    },
    {
      q: "Is Sightline only for solo designers or can it handle a team?",
      a: <>Both. Solo principals use Sightline to know their aligned rate and track project profitability. Studios with teams use those features plus team capacity tracking, per-member utilization, budget revenue across all contributors, and the team hours tile that surfaces who has and hasn't logged time this week. There's no additional charge for team members — unlimited team members are included.</>,
    },
  ];
  return (
    <section
      id="faq"
      style={{
        padding: "96px 48px",
        background: C.cream,
        borderTop: "0.5px solid rgba(44,44,44,0.10)",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, marginBottom: 10 }}>
          Common questions
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(30px,4vw,48px)", fontWeight: 300, lineHeight: 1.12, color: C.charcoal, margin: 0 }}>
          Everything you need
          <br />
          <em style={{ color: C.gold, fontStyle: "italic" }}>to know before you start.</em>
        </h2>
      </div>
      <div style={{ maxWidth: 720, margin: "48px auto 0", display: "flex", flexDirection: "column" }}>
        {qs.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={i}
              style={{
                border: "0.5px solid rgba(44,44,44,0.10)",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 8,
              }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                style={{
                  width: "100%",
                  padding: "18px 22px",
                  fontFamily: FONT_SANS,
                  fontSize: 15,
                  fontWeight: 500,
                  color: C.charcoal,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  background: isOpen ? C.linen : C.cream,
                  border: "none",
                  textAlign: "left",
                }}
              >
                <span>{item.q}</span>
                <span
                  style={{
                    fontSize: 20,
                    color: C.mutedLight,
                    transition: "transform .2s",
                    transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                    marginLeft: 16,
                  }}
                >
                  +
                </span>
              </button>
              <div
                style={{
                  maxHeight: isOpen ? 500 : 0,
                  overflow: "hidden",
                  transition: "max-height .3s ease",
                }}
              >
                <div
                  style={{
                    padding: "0 22px 18px",
                    fontFamily: FONT_SANS,
                    fontSize: 14,
                    color: C.muted,
                    lineHeight: 1.8,
                  }}
                >
                  {item.a}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============ FINAL CTA ============ */
function FinalCTA({ isMobile }: { isMobile: boolean }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (submitting || done) return;
    if (!email.includes("@")) return;
    setSubmitting(true);
    try {
      await fetch(
        "https://services.leadconnectorhq.com/hooks/sff3UkVyRJz0kA9ff0FU/webhook-trigger/1f236954-fc29-49c5-8e24-3bce66a27dca",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            source: "sightline-saas-v1",
            page: window.location.href,
            submitted_at: new Date().toISOString(),
            interest: "sightline",
            list: "early-access",
          }),
        }
      );
    } catch (e) {
      console.warn("Webhook error:", e);
    }
    setDone(true);
  }

  return (
    <section
      style={{
        padding: isMobile ? "64px 24px" : "100px 48px",
        background: C.charcoal,
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, marginBottom: 18 }}>
          Start your free trial today
        </div>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: "clamp(36px,5vw,62px)", fontWeight: 300, color: C.cream, lineHeight: 1.1, marginBottom: 18, marginTop: 0 }}>
          Your firm.
          <br />
          <em style={{ color: C.goldLight, fontStyle: "italic" }}>Finally clear.</em>
        </h2>
        <p style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 400, color: "rgba(250,247,242,0.5)", lineHeight: 1.8, marginBottom: 44, marginTop: 0 }}>
          If you've ever finished a fully booked year wondering where the money went — Sightline
          was built for you. See your aligned rate in under 15 minutes. No spreadsheets. No
          guesswork.
        </p>
        <button
          onClick={() => (window.location.href = "/register")}
          style={{
            display: "block",
            margin: "0 auto 20px",
            padding: "16px 32px",
            background: C.gold,
            color: C.cream,
            border: "none",
            borderRadius: 8,
            fontFamily: FONT_SANS,
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Start my free trial — it's free for 14 days →
        </button>
        <div style={{ fontFamily: FONT_SANS, fontSize: 14, color: "rgba(255,255,255,0.3)", margin: "16px 0" }}>
          or join the waitlist if you're not ready yet
        </div>
        {done ? (
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontStyle: "italic", color: C.goldLight, textAlign: "center", marginBottom: 12 }}>
            You're on the list. We'll be in touch before we open fully.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              maxWidth: 460,
              margin: "0 auto 12px",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="Your email address"
              style={{
                flex: 1,
                padding: "14px 18px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontFamily: FONT_SANS,
                fontSize: 14,
                color: C.cream,
                outline: "none",
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                padding: "14px 24px",
                background: C.gold,
                color: C.cream,
                border: "none",
                borderRadius: 8,
                fontFamily: FONT_SANS,
                fontSize: 14,
                fontWeight: 500,
                cursor: submitting ? "default" : "pointer",
                whiteSpace: "nowrap",
                width: isMobile ? "100%" : undefined,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Sending..." : "Join waitlist"}
            </button>
          </div>
        )}
        <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          No credit card · Founding rate locked at signup · Cancel anytime
        </div>
      </div>
    </section>
  );
}

/* ============ FOOTER ============ */
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
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
  };
  const FLink = ({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) => (
    <a
      href={href}
      style={linkStyle}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
  const ScrollLink = ({ id, children }: { id: string; children: React.ReactNode }) => (
    <button
      onClick={() => scrollTo(id)}
      style={linkStyle}
    >
      {children}
    </button>
  );
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
          <ScrollLink id="features">Features</ScrollLink>
          <ScrollLink id="pricing">Pricing</ScrollLink>
          <ScrollLink id="how-it-works">How it works</ScrollLink>
          <ScrollLink id="faq">FAQ</ScrollLink>
        </div>
        <div>
          <div style={heading}>Resources</div>
          <FLink href="/knowledge">Knowledge base</FLink>
          <FLink href="https://www.proposability.com/financially-designed" external>
            Blog
          </FLink>
          <FLink href="https://www.proposability.com" external>
            Financial Architecture for Designers™
          </FLink>
        </div>
        <div>
          <div style={heading}>Company</div>
          <FLink href="https://www.proposability.com/about" external>
            About Propos'Ability
          </FLink>
          <FLink href="mailto:hello@proposability.com">Contact</FLink>
          <FLink href="/privacy">Privacy Policy</FLink>
          <FLink href="/terms">Terms of Service</FLink>
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
