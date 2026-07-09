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
          gap: 10,
          textDecoration: "none",
          color: C.charcoal,
        }}
      >
        <LogoMark />
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
          $611
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
          { label: "YOUR RATE", val: "$250", valColor: "#C4714A", sub: "−$361/hr below floor", subColor: C.terra },
          { label: "BREAK-EVEN", val: "$354", valColor: "rgba(255,255,255,0.7)", sub: "Cost-only floor", subColor: "rgba(255,255,255,0.35)" },
          { label: "MARGIN TARGET", val: "42%", valColor: "rgba(255,255,255,0.7)", sub: "$257/hr per hour", subColor: "rgba(255,255,255,0.35)" },
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
            width: "41%",
            height: 6,
            background: "rgba(196,113,74,0.4)",
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "41%",
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
        At $250/hr you're leaving $263,430/yr in potential revenue on the table — based on
        730 billable hours annually.
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
      text: "Raise your rate to $360/hr on your next new client proposal",
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
      text: "Calculate what last 3 projects earned at $360/hr",
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
    { n: "$611", l: "avg aligned rate revealed" },
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