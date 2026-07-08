import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sightline by Propos'Ability — Financial clarity for interior design firms" },
      {
        name: "description",
        content:
          "Sightline answers the three questions every interior design firm owner needs — what should I charge, am I hitting my targets, and was this project actually profitable. One platform. Real numbers.",
      },
      { property: "og:title", content: "Sightline by Propos'Ability — Financial clarity for interior design firms" },
      {
        property: "og:description",
        content:
          "Sightline answers the three questions every interior design firm owner needs — what should I charge, am I hitting my targets, and was this project actually profitable.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

/* ===================== TOKENS ===================== */
const C = {
  charcoal: "#2C2C2C",
  cream: "#FAF7F2",
  linen: "#F0EBE3",
  gold: "#B8860B",
  goldDisplay: "#C59845",
  sage: "#5C8A6E",
  terra: "#C4714A",
  muted: "#6B6259",
  mutedLight: "#8A7F75",
  border: "rgba(44,44,44,0.10)",
  borderStrong: "rgba(44,44,44,0.18)",
};

const FONT_DISPLAY = "'Cormorant Garamond', serif";
const FONT_SANS = "'Jost', sans-serif";

/* ===================== SHARED STYLES ===================== */
const eyebrow: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.20em",
  textTransform: "uppercase",
  color: C.gold,
  marginBottom: 20,
};

const h2Style: React.CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: "clamp(32px, 4vw, 52px)",
  fontWeight: 400,
  lineHeight: 1.12,
  color: C.charcoal,
  margin: "0 0 24px 0",
};

const bodyLarge: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 15,
  fontWeight: 400,
  color: C.muted,
  lineHeight: 1.9,
  maxWidth: 560,
};

const btnPrimary: React.CSSProperties = {
  background: C.charcoal,
  color: C.cream,
  padding: "14px 30px",
  fontFamily: FONT_SANS,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  borderRadius: 2,
  border: "none",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
  transition: "opacity .2s",
};
const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: C.charcoal,
  border: `0.5px solid ${C.borderStrong}`,
  padding: "14px 26px",
  fontFamily: FONT_SANS,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  borderRadius: 2,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
  transition: "border-color .2s, color .2s",
};
const btnGold: React.CSSProperties = {
  ...btnPrimary,
  background: C.gold,
};

const sectionBase: React.CSSProperties = {
  padding: "96px 56px",
};
const inner: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
};

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ===================== PAGE ===================== */
function HomePage() {
  return (
    <div style={{ background: C.cream, color: C.charcoal, fontFamily: FONT_SANS }}>
      <ResponsiveStyles />
      <Nav />
      <Hero />
      <ThreeQuestions />
      <RateArchitecture />
      <TheGap />
      <ThreeLevers />
      <Capacity />
      <FeaturesGrid />
      <WhoItsFor />
      <Pricing />
      <ClosingCTA />
      <Footer />
    </div>
  );
}

/* ===================== NAV ===================== */
function Nav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 60,
        background: "rgba(250,247,242,0.95)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: `0.5px solid ${C.border}`,
        zIndex: 100,
        padding: "0 56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
      className="sl-nav"
    >
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 18,
            fontWeight: 400,
            color: C.charcoal,
            letterSpacing: "0.04em",
          }}
        >
          Sightline
        </span>
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 400,
            color: C.mutedLight,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginLeft: 10,
          }}
        >
          by Propos'Ability
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }} className="sl-nav-links">
        <button onClick={() => scrollTo("how-it-works")} style={navLink}>
          How it works
        </button>
        <button onClick={() => scrollTo("pricing")} style={navLink}>
          Pricing
        </button>
        <button onClick={() => scrollTo("cta-form")} style={btnPrimary}>
          Get early access
        </button>
      </div>
    </nav>
  );
}
const navLink: React.CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.charcoal,
  background: "none",
  border: "none",
  cursor: "pointer",
};

/* ===================== HERO ===================== */
function Hero() {
  return (
    <section
      style={{
        minHeight: "100vh",
        padding: "100px 56px 80px",
        background: C.cream,
        position: "relative",
        overflow: "hidden",
      }}
      className="sl-hero"
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.045,
          backgroundImage:
            `repeating-linear-gradient(0deg, ${C.charcoal}, ${C.charcoal} 1px, transparent 1px, transparent 60px),` +
            `repeating-linear-gradient(90deg, ${C.charcoal}, ${C.charcoal} 1px, transparent 1px, transparent 60px)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          ...inner,
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 80,
          alignItems: "center",
          position: "relative",
        }}
        className="sl-hero-grid"
      >
        <div>
          <div style={{ ...eyebrow, letterSpacing: "0.22em" }}>
            Financial architecture for interior design firms
          </div>
          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: "clamp(46px, 5.5vw, 74px)",
              fontWeight: 300,
              lineHeight: 1.05,
              color: C.charcoal,
              margin: "0 0 24px 0",
            }}
          >
            Your firm.
            <br />
            Your numbers.
            <br />
            <em style={{ fontStyle: "italic", color: C.gold, fontWeight: 300 }}>
              Finally clear.
            </em>
          </h1>
          <p style={{ ...bodyLarge, maxWidth: 440, lineHeight: 1.85, marginBottom: 40 }}>
            Sightline answers the three questions every interior design firm owner is
            asking — what should I charge, am I hitting my targets, and was this
            project actually profitable. One platform. Built for the way a design
            firm actually works.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button style={btnPrimary} onClick={() => scrollTo("cta-form")}>
              Join the waitlist
            </button>
            <button style={btnGhost} onClick={() => scrollTo("how-it-works")}>
              See how it works
            </button>
          </div>
          <p
            style={{
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 400,
              color: C.mutedLight,
              marginTop: 16,
            }}
          >
            Early access open now ·{" "}
            <span style={{ fontWeight: 500, color: C.charcoal }}>
              Founding firm pricing available
            </span>
          </p>
        </div>
        <div className="sl-hero-right">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div
      aria-hidden
      style={{
        background: C.charcoal,
        borderRadius: 8,
        boxShadow: "0 32px 80px rgba(44,44,44,0.22), 0 8px 24px rgba(44,44,44,0.12)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.4)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {[C.terra, C.gold, C.sage].map((c) => (
          <span
            key={c}
            style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }}
          />
        ))}
        <span
          style={{
            fontSize: 8,
            letterSpacing: "0.08em",
            color: "rgba(255,255,255,0.18)",
            marginLeft: 8,
            fontFamily: FONT_SANS,
          }}
        >
          Sightline · Dashboard
        </span>
      </div>
      <div style={{ padding: 16 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 5,
            padding: "14px 16px",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 7,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "rgba(197,152,69,0.7)",
              marginBottom: 8,
              fontFamily: FONT_SANS,
            }}
          >
            Rate architecture · your financial floor
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 300, color: "#fff", lineHeight: 1 }}
            >
              $611
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: FONT_SANS }}>
              /hr
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 9,
                fontWeight: 500,
                padding: "2px 8px",
                background: "rgba(196,113,74,0.18)",
                color: "#E08060",
                borderRadius: 2,
                fontFamily: FONT_SANS,
              }}
            >
              Below break-even
            </span>
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.25)",
              marginTop: 4,
              marginBottom: 12,
              fontFamily: FONT_SANS,
            }}
          >
            Your aligned rate. The minimum your cost structure requires.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <MockCol label="YOUR RATE" value="$250/hr" valueColor={C.terra} sub="−$361/hr below floor" subColor={C.terra} />
            <MockCol label="BREAK-EVEN" value="$354/hr" valueColor="rgba(255,255,255,0.7)" sub="Cost-only floor" />
            <MockCol label="MARGIN TARGET" value="42%" valueColor="rgba(255,255,255,0.7)" sub="$257/hr per hour" />
          </div>
          <div
            style={{
              height: 5,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 3,
              position: "relative",
              margin: "10px 0 6px",
            }}
          >
            <div
              style={{
                width: "41%",
                height: "100%",
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
                height: 11,
                background: C.terra,
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 0,
                top: -3,
                width: 1.5,
                height: 11,
                background: "rgba(197,152,69,0.6)",
              }}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          <MockTile label="HOURS THIS WEEK">
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "#fff" }}>12.5</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: FONT_SANS }}>/30</span>
            <div style={{ height: 2, background: "rgba(255,255,255,0.06)", marginTop: 6, borderRadius: 1 }}>
              <div style={{ width: "42%", height: "100%", background: C.gold, borderRadius: 1 }} />
            </div>
          </MockTile>
          <MockTile label="ACTIVE PROJECTS">
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "#fff" }}>4</span>
            <div style={{ fontSize: 8, color: "rgba(92,138,110,0.7)", marginTop: 4, fontFamily: FONT_SANS }}>
              2 healthy · 1 watch
            </div>
          </MockTile>
          <MockTile label="CAPACITY">
            <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: "rgba(92,138,110,0.8)" }}>
              Comfortable
            </span>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", marginTop: 4, fontFamily: FONT_SANS }}>
              263 hrs available
            </div>
          </MockTile>
        </div>
      </div>
    </div>
  );
}

function MockCol({
  label,
  value,
  valueColor,
  sub,
  subColor = "rgba(255,255,255,0.28)",
}: {
  label: string;
  value: string;
  valueColor: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div style={{ padding: "10px 12px", borderRight: "0.5px solid rgba(255,255,255,0.07)" }}>
      <div
        style={{
          fontSize: 7,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.28)",
          fontFamily: FONT_SANS,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: valueColor, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 8, color: subColor, marginTop: 2, fontFamily: FONT_SANS }}>{sub}</div>
    </div>
  );
}
function MockTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 3,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 7,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "rgba(255,255,255,0.28)",
          fontFamily: FONT_SANS,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/* ===================== THREE QUESTIONS ===================== */
function ThreeQuestions() {
  const cards = [
    {
      n: "01",
      q: "What should I charge?",
      a: (
        <>
          Not what someone told you at a conference. Not what the designer down the
          street charges. Your number — derived from what your firm actually costs
          to run, what you need to take home, and what your team costs.{" "}
          <strong>Sightline calculates your aligned rate</strong> and shows you
          exactly how it's built, layer by layer.
        </>
      ),
    },
    {
      n: "02",
      q: "Am I hitting my targets?",
      a: (
        <>
          Hours, revenue, and capacity tracked in real time — not at the end of the
          year when it's too late to adjust. Sightline shows you how your current
          week compares to your targets, where your workload is distributed across
          the next <strong>sixteen weeks</strong>, and exactly when you have room
          for the next inquiry.
        </>
      ),
    },
    {
      n: "03",
      q: "Was this project actually profitable?",
      a: (
        <>
          Not — did the client pay the invoice. Did the project cover what it
          actually cost your firm to deliver it? Sightline tracks{" "}
          <strong>margin against your aligned rate in real time</strong> — so you
          know while the project is still open, not after you've closed it and
          moved on.
        </>
      ),
    },
  ];

  return (
    <section
      id="how-it-works"
      style={{
        ...sectionBase,
        background: C.linen,
        borderTop: `0.5px solid ${C.border}`,
        borderBottom: `0.5px solid ${C.border}`,
      }}
    >
      <div style={inner}>
        <div style={eyebrow}>Three questions. One platform.</div>
        <h2 style={h2Style}>
          The answers every designer
          <br />
          needs but rarely has.
        </h2>
        <p style={bodyLarge}>
          Most interior designers run their firms on instinct, industry averages,
          and a spreadsheet that hasn't been updated since last year. Sightline
          replaces all of that with your actual numbers — built from your
          compensation, your expenses, your team, and your hours.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            marginTop: 52,
            background: C.border,
            gap: 0,
            borderRadius: 4,
            overflow: "hidden",
          }}
          className="sl-questions-grid"
        >
          {cards.map((card, i) => (
            <div
              key={card.n}
              style={{
                background: C.cream,
                padding: "40px 34px",
                borderRight: i < 2 ? `0.5px solid ${C.border}` : "none",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 12,
                  right: 20,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 72,
                  fontWeight: 300,
                  color: "rgba(44,44,44,0.05)",
                  lineHeight: 1,
                }}
              >
                {card.n}
              </div>
              <div style={{ width: 28, height: 0.5, background: C.gold, marginBottom: 22 }} />
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 22,
                  fontWeight: 400,
                  fontStyle: "italic",
                  color: C.charcoal,
                  lineHeight: 1.35,
                  marginBottom: 14,
                }}
              >
                {card.q}
              </div>
              <div
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 13,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.85,
                }}
              >
                {card.a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== RATE ARCHITECTURE ===================== */
const LAYERS = [
  {
    num: "Layer 01",
    name: "Foundation",
    sub: "What you pay yourself",
    body:
      "Your draw, payroll tax, health insurance, retirement. This is the base everything else sits on. Get it wrong and nothing above it holds.",
  },
  {
    num: "Layer 02",
    name: "Structure",
    sub: "What it costs to run the firm",
    body:
      "Software, insurance, rent, subscriptions. Fixed costs that run whether you bill ten hours this week or forty. Every subscription you add raises this layer.",
  },
  {
    num: "Layer 03",
    name: "Systems",
    sub: "What your team actually costs",
    body:
      "Not their salary — their fully burdened cost. Each person added raises the load this building has to carry. Sightline calculates this automatically.",
  },
  {
    num: "Layer 04",
    name: "The envelope",
    sub: "How many hours you actually bill",
    body:
      "A building that sits half-empty still costs the same to maintain. Every unbilled hour raises what each billed hour has to carry. Utilization is the most underestimated lever in the firm.",
  },
  {
    num: "Layer 05",
    name: "The finish",
    sub: "Margin — what makes growth possible",
    body:
      "You can't finish a building that isn't structurally complete. Margin is what funds slow months, future hires, and your next chapter. It's not a bonus — it's what you build toward.",
  },
];

const BLOCKS = [
  { h: 66, bg: "#2C2C2C", label: "Owner compensation", amount: "$137k/yr", radius: "0 0 3px 3px" },
  { h: 52, bg: "#4A3F35", label: "Operating expenses", amount: "$53k/yr" },
  { h: 58, bg: "#3D4A3F", label: "Team cost", amount: "$74k/yr" },
  { h: 74, bg: "#C4714A", label: "Billable hours", amount: "730/yr" },
  { h: 52, bg: "#8B6914", label: "Margin", amount: "+$257/hr" },
];

function RateArchitecture() {
  const [active, setActive] = useState(0);
  return (
    <section style={{ ...sectionBase, background: C.cream }}>
      <div style={inner}>
        <div style={eyebrow}>Rate architecture</div>
        <h2 style={h2Style}>
          Your rate is a building.
          <br />
          Five layers. <em style={{ fontStyle: "italic", color: C.gold }}>One floor.</em>
        </h2>
        <p style={bodyLarge}>
          Every cost your firm carries contributes to the minimum hourly rate you
          need to charge. Sightline makes that structure visible — so you can see
          exactly what each layer costs per billable hour and what changes when
          anything shifts.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 72,
            alignItems: "start",
            marginTop: 52,
          }}
          className="sl-two-col"
        >
          <div>
            {LAYERS.map((l, i) => (
              <div
                key={l.num}
                onClick={() => setActive(i)}
                style={{
                  padding: "18px 20px",
                  cursor: "pointer",
                  borderLeft: `2px solid ${active === i ? C.gold : "transparent"}`,
                  background: active === i ? "rgba(184,134,11,0.04)" : "transparent",
                  borderBottom:
                    i < LAYERS.length - 1 ? `0.5px solid ${C.border}` : "none",
                  transition: "border-color .2s, background .2s",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: C.gold,
                    marginBottom: 4,
                    fontFamily: FONT_SANS,
                  }}
                >
                  {l.num}
                </div>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 18,
                    fontWeight: 400,
                    color: C.charcoal,
                    marginBottom: 4,
                  }}
                >
                  {l.name} — <span style={{ color: C.mutedLight }}>{l.sub}</span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: C.muted,
                    lineHeight: 1.7,
                    fontFamily: FONT_SANS,
                  }}
                >
                  {l.body}
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: "sticky", top: 80 }}>
            <div style={{ display: "flex", flexDirection: "column-reverse", gap: 2 }}>
              {BLOCKS.map((b, i) => (
                <div
                  key={i}
                  style={{
                    height: b.h,
                    background: b.bg,
                    borderRadius: b.radius || undefined,
                    opacity: active === i ? 1 : 0.45,
                    transition: "opacity .2s",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.85)",
                      letterSpacing: "0.04em",
                      fontFamily: FONT_SANS,
                    }}
                  >
                    {b.label}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: FONT_DISPLAY,
                      fontSize: 14,
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {b.amount}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ height: 1.5, background: C.charcoal, marginTop: 8, marginBottom: 6 }} />
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: C.mutedLight,
                textAlign: "center",
                fontFamily: FONT_SANS,
                fontWeight: 600,
              }}
            >
              Cost floor
            </div>
            <div
              style={{
                background: "rgba(184,134,11,0.07)",
                border: "0.5px solid rgba(184,134,11,0.2)",
                borderRadius: 4,
                padding: "14px 16px",
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.gold,
                    fontFamily: FONT_SANS,
                  }}
                >
                  Aligned rate
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: C.mutedLight,
                    marginTop: 2,
                    fontFamily: FONT_SANS,
                  }}
                >
                  Your minimum floor
                </div>
              </div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 400, color: C.charcoal }}>
                $611/hr
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== THE GAP ===================== */
function TheGap() {
  const stats = [
    {
      n: "$72k",
      t: (
        <>
          per year at a $100/hr gap across 720 billable hours.{" "}
          <strong>The gap doesn't announce itself.</strong> It just compounds.
        </>
      ),
    },
    {
      n: "$360k",
      t: (
        <>
          over five years if the rate stays flat while costs grow.{" "}
          <strong>Which they always do.</strong>
        </>
      ),
    },
    {
      n: "3",
      t: (
        <>
          levers to close it. <strong>Rate. Utilization. Cost structure.</strong>{" "}
          Sightline shows you which one moves the needle most for your firm.
        </>
      ),
    },
  ];
  return (
    <section style={{ ...sectionBase, background: C.charcoal }}>
      <div
        style={{
          ...inner,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 72,
          alignItems: "center",
        }}
        className="sl-two-col"
      >
        <div>
          <div style={{ ...eyebrow, color: C.gold }}>The gap</div>
          <h2 style={{ ...h2Style, color: C.cream }}>
            The space between what you charge and what you need to charge{" "}
            <em style={{ fontStyle: "italic", color: C.gold }}>has a cost.</em>
          </h2>
          <p
            style={{
              fontFamily: FONT_SANS,
              fontSize: 15,
              fontWeight: 400,
              color: "rgba(250,247,242,0.55)",
              lineHeight: 1.9,
              marginTop: 14,
            }}
          >
            Most designers have never seen this number. It's been accumulating
            quietly — in every project, in every proposal, in every year that ended
            with a full calendar and less money than the effort deserved.
          </p>
          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 20 }}>
            {stats.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  paddingBottom: 20,
                  borderBottom:
                    i < stats.length - 1 ? "0.5px solid rgba(255,255,255,0.08)" : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 52,
                    fontWeight: 300,
                    color: C.goldDisplay,
                    lineHeight: 1,
                    marginRight: 14,
                    minWidth: 100,
                  }}
                >
                  {s.n}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: "rgba(250,247,242,0.5)",
                    lineHeight: 1.7,
                    fontFamily: FONT_SANS,
                  }}
                >
                  {s.t}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            padding: "28px 24px",
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.25)",
              marginBottom: 20,
              fontFamily: FONT_SANS,
            }}
          >
            Your rate position
          </div>
          <div style={{ marginTop: 36, position: "relative" }}>
            <div
              style={{
                height: 10,
                background: "rgba(255,255,255,0.06)",
                borderRadius: 5,
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "41%",
                  height: 10,
                  background: "rgba(196,113,74,0.45)",
                  borderRadius: 5,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "41%",
                  top: -6,
                  width: 2,
                  height: 22,
                  background: C.terra,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    left: 0,
                    transform: "translateX(-50%)",
                    fontSize: 9,
                    fontWeight: 500,
                    color: C.terra,
                    fontFamily: FONT_SANS,
                    whiteSpace: "nowrap",
                  }}
                >
                  $250/hr
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 24,
                    left: 0,
                    transform: "translateX(-50%)",
                    fontSize: 8,
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: FONT_SANS,
                    whiteSpace: "nowrap",
                  }}
                >
                  your rate
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: -6,
                  width: 1.5,
                  height: 22,
                  background: "rgba(197,152,69,0.7)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    right: 0,
                    transform: "translateX(50%)",
                    fontSize: 9,
                    fontWeight: 500,
                    color: C.goldDisplay,
                    fontFamily: FONT_SANS,
                    whiteSpace: "nowrap",
                  }}
                >
                  $611/hr
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 24,
                    right: 0,
                    transform: "translateX(50%)",
                    fontSize: 8,
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: FONT_SANS,
                    whiteSpace: "nowrap",
                  }}
                >
                  aligned rate
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontStyle: "italic",
              marginTop: 28,
              fontFamily: FONT_SANS,
            }}
          >
            ← $361/hr gap →
          </div>
          <div style={{ marginTop: 24 }}>
            {[
              { l: "Annual revenue at $250/hr", v: "$182,500", c: C.terra },
              { l: "Cost floor (what the firm needs)", v: "$264,035", c: "rgba(255,255,255,0.5)" },
              { l: "Annual shortfall", v: "−$81,535", c: C.terra },
              { l: "Revenue at aligned rate", v: "$446,030", c: C.goldDisplay, top: true },
            ].map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: r.top ? "12px 0 0" : "10px 0",
                  borderBottom: r.top ? "none" : "0.5px solid rgba(255,255,255,0.06)",
                  borderTop: r.top ? "0.5px solid rgba(255,255,255,0.12)" : "none",
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: FONT_SANS }}>
                  {r.l}
                </span>
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 18,
                    fontWeight: 300,
                    color: r.c,
                  }}
                >
                  {r.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== THREE LEVERS ===================== */
function ThreeLevers() {
  const levers = [
    {
      n: "01",
      title: "Raise what you charge",
      body:
        "The most direct lever. Every dollar you raise your rate closes the gap by a dollar on every future hour billed. A phased increase — new clients first, existing clients with 90 days notice — is often the lowest-friction path.",
      ex: (
        <>
          <strong>At $100/hr gap:</strong> a $50 rate increase closes half the gap
          in every hour billed from that moment forward. One proposal at the new
          rate is enough to start.
        </>
      ),
    },
    {
      n: "02",
      title: "Bill more of the hours you already work",
      body:
        "Recovering unbilled time lowers your aligned rate — because the same cost floor is divided across more revenue. No rate change required. The hours are already there. The question is whether you're logging them.",
      ex: (
        <>
          <strong>At 38% utilization:</strong> raising billable hours from 15 to 20
          per week drops the aligned rate by $153/hr. More than a $100 rate
          increase would.
        </>
      ),
    },
    {
      n: "03",
      title: "Reduce what it costs to deliver",
      body:
        "Every dollar removed from your cost floor lowers your aligned rate. Software you're not using, subscriptions that renewed automatically, tools that made sense two years ago. Eliminating them gives every hour more room.",
      ex: (
        <>
          <strong>Cutting $6,000/yr</strong> in operating expenses at 730 billable
          hours lowers the aligned rate by $8/hr — permanently, without a single
          client conversation.
        </>
      ),
    },
  ];
  return (
    <section
      style={{
        ...sectionBase,
        background: C.cream,
        borderTop: `0.5px solid ${C.border}`,
      }}
    >
      <div style={inner}>
        <div style={eyebrow}>Closing the gap</div>
        <h2 style={h2Style}>
          Three levers.
          <br />
          <em style={{ fontStyle: "italic", color: C.gold }}>
            Every path runs through one of them.
          </em>
        </h2>
        <p style={bodyLarge}>
          Most designers assume the only answer is to raise the rate. But depending
          on the composition of your gap — how much is pricing, how much is
          utilization, how much is cost structure — one lever might close more than
          the others.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            background: C.border,
            gap: 1,
            borderRadius: 4,
            overflow: "hidden",
            marginTop: 52,
          }}
          className="sl-3col"
        >
          {levers.map((l) => (
            <div key={l.n} style={{ background: C.cream, padding: "40px 32px" }}>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 80,
                  fontWeight: 300,
                  color: "rgba(44,44,44,0.07)",
                  lineHeight: 1,
                  marginBottom: 16,
                }}
              >
                {l.n}
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 22,
                  fontWeight: 400,
                  color: C.charcoal,
                  lineHeight: 1.3,
                  marginBottom: 10,
                }}
              >
                {l.title}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.85,
                  marginBottom: 16,
                  fontFamily: FONT_SANS,
                }}
              >
                {l.body}
              </div>
              <div
                style={{
                  background: "rgba(184,134,11,0.08)",
                  borderLeft: "2px solid rgba(184,134,11,0.4)",
                  borderRadius: "0 3px 3px 0",
                  padding: "10px 12px",
                  fontSize: 13,
                  color: C.charcoal,
                  lineHeight: 1.6,
                  fontFamily: FONT_SANS,
                }}
              >
                {l.ex}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== CAPACITY ===================== */
const CAP_DATA = [14, 18, 22, 28, 32, 36, 38, 34, 28, 22, 16, 12, 20, 26, 18, 14];
const CAP_TARGET = 30;
const CAP_MAX = 48;

function Capacity() {
  const points = [
    {
      title: "Weekly pressure chart",
      desc: "16 weeks of committed hours vs. your target — color-coded by pressure so the shape of your workload is visible at a glance.",
    },
    {
      title: "Project timeline",
      desc: "Every active project mapped across a six-month window. See where projects overlap and where pressure concentrates.",
    },
    {
      title: "What-if tool",
      desc: "Enter estimated hours and a start window — Sightline tells you whether the project fits, how much of the window it uses, and what's left.",
    },
  ];
  const windows = [
    { period: "NOW — END OF JULY", desc: "Room for a mid-size engagement or several smaller ones.", hours: "~210 hrs", color: C.sage },
    { period: "AUGUST — SEPTEMBER", desc: "Limited availability. Small scope only or defer.", hours: "~95 hrs", color: C.gold },
    { period: "OCTOBER — DECEMBER", desc: "Best window for a large engagement this year.", hours: "~280 hrs", color: C.sage },
  ];
  return (
    <section
      style={{
        ...sectionBase,
        background: C.linen,
        borderTop: `0.5px solid ${C.border}`,
      }}
    >
      <div
        style={{
          ...inner,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 72,
          alignItems: "center",
        }}
        className="sl-two-col"
      >
        <div>
          <div style={eyebrow}>Capacity</div>
          <h2 style={h2Style}>
            Not how full the bucket is.
            <br />
            <em style={{ fontStyle: "italic", color: C.gold }}>When you have room.</em>
          </h2>
          <p style={bodyLarge}>
            Knowing you're at 70% capacity today tells you nothing about whether
            August is wide open or already overcommitted. Sightline maps your
            workload week by week across sixteen weeks so you can answer the
            inquiry that just landed with data — not a feeling.
          </p>
          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
            {points.map((p) => (
              <div key={p.title} style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 2,
                    minHeight: 40,
                    background: C.gold,
                    opacity: 0.5,
                    flexShrink: 0,
                    marginTop: 3,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.charcoal,
                      marginBottom: 3,
                      fontFamily: FONT_SANS,
                    }}
                  >
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: C.muted,
                      lineHeight: 1.7,
                      fontFamily: FONT_SANS,
                    }}
                  >
                    {p.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div
            style={{
              background: C.cream,
              border: `0.5px solid ${C.border}`,
              borderRadius: 6,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: C.mutedLight,
                marginBottom: 14,
                fontFamily: FONT_SANS,
              }}
            >
              Weekly pressure — next 16 weeks
            </div>
            <div
              style={{
                height: 80,
                background: C.linen,
                borderRadius: 3,
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
                  left: 0,
                  right: 0,
                  bottom: `${(CAP_TARGET / CAP_MAX) * 100}%`,
                  borderTop: "1px dashed rgba(44,44,44,0.18)",
                }}
              />
              {CAP_DATA.map((w, i) => {
                const color =
                  w >= CAP_TARGET ? C.terra : w >= CAP_TARGET * 0.8 ? C.gold : C.sage;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${Math.min(w / CAP_MAX, 1) * 100}%`,
                      background: color,
                      borderRadius: "1px 1px 0 0",
                    }}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 3, padding: "0 8px" }}>
              {CAP_DATA.map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    fontSize: 8,
                    color: C.mutedLight,
                    textAlign: "center",
                    fontFamily: FONT_SANS,
                  }}
                >
                  {i % 2 === 0 ? `W${i + 1}` : ""}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              {[
                { label: "Within target", c: C.sage },
                { label: "Approaching", c: C.gold },
                { label: "Over committed", c: C.terra },
              ].map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, background: l.c, borderRadius: 1 }} />
                  <span style={{ fontSize: 10, color: C.mutedLight, fontFamily: FONT_SANS }}>
                    {l.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {windows.map((w) => (
              <div
                key={w.period}
                style={{
                  background: C.cream,
                  border: `0.5px solid ${C.border}`,
                  borderRadius: 4,
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: w.color,
                      fontFamily: FONT_SANS,
                    }}
                  >
                    {w.period}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 400,
                      color: C.mutedLight,
                      marginTop: 2,
                      fontFamily: FONT_SANS,
                    }}
                  >
                    {w.desc}
                  </div>
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 300, color: w.color }}>
                  {w.hours}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== FEATURES GRID ===================== */
function FeaturesGrid() {
  const features = [
    {
      eb: "Aligned rate",
      t: "Your financial floor, calculated from your inputs",
      b: "Five-layer rate architecture built from your compensation, operating expenses, team costs, billable hours, and margin target. Updates in real time when anything changes. Rate history shows every change and why it happened.",
      tag: "Always visible on the dashboard →",
    },
    {
      eb: "Project profitability",
      t: "Margin tracked against your aligned rate — not just what you quoted",
      b: "Real-time project margin shows how many hours remain, what the current margin is, and whether the project is still on track — or drifting. Data freshness states surface when time entries go stale before the margin figure becomes unreliable.",
      tag: "Live on every project card →",
    },
    {
      eb: "Capacity planning",
      t: "Work arriving over time — not a percentage, a picture",
      b: "Weekly pressure chart across 16 weeks, project timeline view, dynamically calculated open windows, and a what-if tool that answers 'can I take this?' before you commit. Say yes from data, not optimism.",
      tag: "Timeline tab in capacity view →",
    },
    {
      eb: "Personalized action engine",
      t: "The most leveraged action for your firm, right now",
      b: "Gap composition analysis identifies whether your gap is primarily a pricing problem, a utilization problem, or a cost structure problem — then surfaces specific actions with your actual dollar amounts. Never repeats the same framing if nothing's changed. Holds prior commitments accountable before suggesting new ones.",
      tag: "Updates on every dashboard load →",
    },
    {
      eb: "Team visibility",
      t: "Every team member's capacity and contribution — in one view",
      b: "Per-member capacity cards show target hours, hours logged this week, and status. The team hours tile on the dashboard surfaces who's logged and who hasn't — with a one-click reminder that goes only to members who are behind.",
      tag: "Team tab in capacity view →",
    },
    {
      eb: "Model a change",
      t: "Scenario modeling that knows the difference between planning and committing",
      b: "Three levers — rate, utilization, cost reduction — with a live preview of the gap impact. The commit button stays locked until a lever moves. When you're ready to act, the commitment screen asks for specific behavioral steps, not plans. The system tracks whether you kept them.",
      tag: "Rate architecture screen →",
    },
  ];
  return (
    <section style={{ ...sectionBase, background: C.cream, borderTop: `0.5px solid ${C.border}` }}>
      <div style={inner}>
        <div style={eyebrow}>Built for design firms</div>
        <h2 style={h2Style}>
          Everything the firm needs.
          <br />
          Nothing generic software adds.
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: C.border,
            gap: 1,
            borderRadius: 4,
            overflow: "hidden",
            marginTop: 52,
          }}
          className="sl-2col"
        >
          {features.map((f) => (
            <div key={f.t} style={{ background: C.cream, padding: "36px 32px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  color: C.gold,
                  marginBottom: 10,
                  fontFamily: FONT_SANS,
                }}
              >
                {f.eb}
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 20,
                  fontWeight: 400,
                  color: C.charcoal,
                  lineHeight: 1.3,
                  marginBottom: 10,
                }}
              >
                {f.t}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.85,
                  fontFamily: FONT_SANS,
                }}
              >
                {f.b}
              </div>
              <div
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: C.gold,
                  borderBottom: "0.5px solid rgba(184,134,11,0.3)",
                  paddingBottom: 2,
                  fontFamily: FONT_SANS,
                }}
              >
                {f.tag}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== WHO IT'S FOR ===================== */
function WhoItsFor() {
  const cards = [
    {
      label: "The solo principal",
      type: "Running everything yourself",
      body: "You're the designer, the project manager, and the business owner. Sightline gives you the financial clarity to price confidently and know whether the work you're doing is sustainable — without adding hours to your week.",
    },
    {
      label: "The growing studio",
      type: "Principal plus a small team",
      body: "You've hired or are considering it. The firm's cost structure is more complex now, and the rate question is harder to answer. Sightline accounts for every team member's fully burdened cost and billable capacity so the rate reflects the whole firm.",
    },
    {
      label: "The established firm",
      type: "Multiple principals or teams",
      body: "The firm has history, clients, and complexity. You need a financial picture that shows total firm capacity, budget revenue across all contributors, and project profitability that accounts for what each hour actually costs — not just what was quoted.",
    },
  ];
  return (
    <section style={{ ...sectionBase, background: C.cream, borderTop: `0.5px solid ${C.border}` }}>
      <div style={inner}>
        <div style={eyebrow}>Who Sightline is for</div>
        <h2 style={h2Style}>
          Built exclusively for{" "}
          <em style={{ fontStyle: "italic", color: C.gold }}>
            interior design firm owners.
          </em>
        </h2>
        <p style={bodyLarge}>
          Not adapted from generic business software. Not a spreadsheet with better
          fonts. Built from scratch for the way a design firm actually works —
          project-based, team-dependent, time-sensitive, and consistently
          underpriced.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
            marginTop: 48,
          }}
          className="sl-3col"
        >
          {cards.map((c) => (
            <div
              key={c.label}
              style={{
                padding: "28px 24px",
                border: `0.5px solid ${C.border}`,
                borderRadius: 4,
                background: C.cream,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: C.mutedLight,
                  marginBottom: 8,
                  fontFamily: FONT_SANS,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 20,
                  fontWeight: 400,
                  color: C.charcoal,
                  marginBottom: 10,
                }}
              >
                {c.type}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.8,
                  fontFamily: FONT_SANS,
                }}
              >
                {c.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ===================== PRICING ===================== */
function Pricing() {
  const plans = [
    {
      badge: "Sightline",
      badgeStyle: "gold" as const,
      name: "For the solo principal",
      desc: "Rate architecture, project profitability tracking, capacity planning, and the action engine — everything a solo designer needs to run a financially clear firm.",
      price: "$69",
      founding: "Founding firm rate: $39/mo while early access is open",
      features: [
        "Aligned rate with full layer breakdown",
        "Real-time project margin tracking",
        "Capacity timeline — 16-week pressure chart",
        "Personalized action engine",
        "Model a change + commit to action",
        "Rate history and change tracking",
        "Knowledge base — 8 in-depth guides",
      ],
      cta: "Join the waitlist",
      ctaStyle: "ghost" as const,
    },
    {
      badge: "Practice — Most complete",
      badgeStyle: "dark" as const,
      name: "For the studio with a team",
      desc: "Everything in Sightline, plus multi-principal support, full team capacity tracking, per-member utilization, budget revenue across all contributors, and the full team cost breakdown.",
      price: "$129",
      founding: "Founding firm rate: $79/mo while early access is open",
      features: [
        "Everything in Sightline",
        "Multi-principal compensation support",
        "Team capacity cards — per-member tracking",
        "Budget revenue across all billable contributors",
        "Fully burdened team cost breakdown",
        "Team hours tile + email reminder",
        "Per-member utilization table",
      ],
      cta: "Join the waitlist",
      ctaStyle: "primary" as const,
    },
  ];
  return (
    <section id="pricing" style={{ ...sectionBase, background: C.linen, borderTop: `0.5px solid ${C.border}` }}>
      <div style={inner}>
        <div style={eyebrow}>Pricing</div>
        <h2 style={h2Style}>
          Simple, transparent,
          <br />
          <em style={{ fontStyle: "italic", color: C.gold }}>built for design firms.</em>
        </h2>
        <p style={bodyLarge}>
          Two tiers. No per-seat fees. No feature-gating that makes the product
          useless until you upgrade. Founding firm pricing available now while
          early access is open.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            marginTop: 52,
          }}
          className="sl-2col"
        >
          {plans.map((p) => (
            <div
              key={p.name}
              style={{
                background: C.cream,
                border: `0.5px solid ${C.border}`,
                borderRadius: 4,
                padding: "36px 32px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  color: p.badgeStyle === "dark" ? C.charcoal : C.gold,
                  border:
                    p.badgeStyle === "dark"
                      ? "0.5px solid rgba(44,44,44,0.2)"
                      : "0.5px solid rgba(184,134,11,0.3)",
                  background: p.badgeStyle === "dark" ? "rgba(44,44,44,0.05)" : "transparent",
                  borderRadius: 2,
                  padding: "3px 8px",
                  marginBottom: 16,
                  fontFamily: FONT_SANS,
                }}
              >
                {p.badge}
              </span>
              <div
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 26,
                  fontWeight: 400,
                  color: C.charcoal,
                  marginBottom: 6,
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: C.muted,
                  lineHeight: 1.7,
                  marginBottom: 24,
                  fontFamily: FONT_SANS,
                }}
              >
                {p.desc}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 54,
                    fontWeight: 300,
                    color: C.charcoal,
                    lineHeight: 1,
                  }}
                >
                  {p.price}
                </span>
                <span style={{ fontSize: 13, fontWeight: 400, color: C.mutedLight, fontFamily: FONT_SANS }}>
                  /month
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: C.sage,
                  marginTop: 12,
                  marginBottom: 24,
                  fontFamily: FONT_SANS,
                }}
              >
                {p.founding}
              </div>
              <div style={{ height: 0.5, background: C.border, margin: "20px 0" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {p.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: C.sage, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>✓</span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: C.muted,
                        lineHeight: 1.6,
                        fontFamily: FONT_SANS,
                      }}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => scrollTo("cta-form")}
                style={{
                  ...(p.ctaStyle === "primary" ? btnPrimary : btnGhost),
                  width: "100%",
                  marginTop: 28,
                  padding: 13,
                  fontSize: 11,
                  letterSpacing: "0.16em",
                }}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 24,
            background: "rgba(92,138,110,0.07)",
            border: "0.5px solid rgba(92,138,110,0.2)",
            borderRadius: 4,
            padding: "16px 18px",
            fontSize: 14,
            fontWeight: 400,
            color: C.charcoal,
            lineHeight: 1.7,
            fontFamily: FONT_SANS,
          }}
        >
          <strong style={{ fontWeight: 500 }}>Founding firm</strong> pricing is
          available during early access. This rate locks permanently — it never
          increases as long as your subscription is active. Once early access
          closes, pricing returns to standard rates.
        </div>
      </div>
    </section>
  );
}

/* ===================== CLOSING CTA ===================== */
const WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/sff3UkVyRJz0kA9ff0FU/webhook-trigger/1f236954-fc29-49c5-8e24-3bce66a27dca";
const SOURCE_TAG = "sightline-sales-v5";

function ClosingCTA() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    if (submitted || submitting) return;
    const value = email.trim();
    if (!value || !value.includes("@")) {
      const el = document.getElementById("cta-email") as HTMLInputElement | null;
      el?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          source: SOURCE_TAG,
          page: typeof window !== "undefined" ? window.location.href : "",
          submitted_at: new Date().toISOString(),
          interest: "sightline",
          list: "early-access",
        }),
      });
    } catch (err) {
      console.warn("waitlist submit failed", err);
    } finally {
      setSubmitted(true);
      setSubmitting(false);
    }
  }

  return (
    <section style={{ background: C.charcoal, padding: "100px 56px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
        <div style={{ ...eyebrow, letterSpacing: "0.22em", marginBottom: 20 }}>
          Early access
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: "clamp(38px, 4.5vw, 60px)",
            fontWeight: 300,
            color: C.cream,
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          Your firm.
          <br />
          <em style={{ fontStyle: "italic", color: C.gold }}>Finally clear.</em>
        </h2>
        <p
          style={{
            fontFamily: FONT_SANS,
            fontSize: 15,
            fontWeight: 400,
            color: "rgba(250,247,242,0.45)",
            lineHeight: 1.85,
            marginBottom: 44,
          }}
        >
          If you've ever finished a fully booked year wondering where the money
          went — Sightline was built for you. Join the waitlist for early access
          and founding firm pricing while early access is open.
        </p>
        {!submitted ? (
          <>
            <div
              id="cta-form"
              style={{
                display: "flex",
                gap: 8,
                maxWidth: 480,
                margin: "0 auto 14px",
              }}
              className="sl-cta-form"
            >
              <input
                id="cta-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                style={{
                  flex: 1,
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.06)",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                  borderRadius: 2,
                  fontFamily: FONT_SANS,
                  fontSize: 14,
                  fontWeight: 400,
                  color: C.cream,
                  outline: "none",
                }}
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  ...btnGold,
                  padding: "14px 28px",
                  whiteSpace: "nowrap",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Sending…" : "Get early access"}
              </button>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: "rgba(255,255,255,0.2)",
                marginTop: 6,
                textAlign: "center",
                fontFamily: FONT_SANS,
              }}
            >
              No credit card required · Founding firm rate locked on signup
            </div>
          </>
        ) : (
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 22,
              fontWeight: 300,
              fontStyle: "italic",
              color: C.goldDisplay,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            You're on the list. We'll be in touch before we open to the public.
          </div>
        )}
      </div>
    </section>
  );
}

/* ===================== FOOTER ===================== */
function Footer() {
  return (
    <footer
      style={{
        background: C.charcoal,
        borderTop: "0.5px solid rgba(255,255,255,0.07)",
        padding: "28px 56px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
      className="sl-footer"
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 15,
          fontWeight: 400,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "0.04em",
        }}
      >
        Sightline · by Propos'Ability
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: "rgba(255,255,255,0.2)",
          fontFamily: FONT_SANS,
        }}
      >
        © 2026 Propos'Ability · Financial Architecture for Designers™
      </div>
    </footer>
  );
}

/* ===================== RESPONSIVE ===================== */
function ResponsiveStyles() {
  useEffect(() => {}, []);
  return (
    <style>{`
      @media (max-width: 900px) {
        .sl-nav { padding: 0 24px !important; }
        .sl-nav-links > button:not(:last-child) { display: none !important; }
        .sl-hero { padding: 90px 24px 60px !important; }
        .sl-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        .sl-hero-right { display: none !important; }
        section { padding: 64px 24px !important; }
        .sl-questions-grid { grid-template-columns: 1fr !important; }
        .sl-questions-grid > div { border-right: none !important; border-bottom: 0.5px solid ${C.border} !important; }
        .sl-questions-grid > div:last-child { border-bottom: none !important; }
        .sl-two-col { grid-template-columns: 1fr !important; gap: 40px !important; }
        .sl-3col { grid-template-columns: 1fr !important; }
        .sl-2col { grid-template-columns: 1fr !important; }
        .sl-cta-form { flex-direction: column !important; }
        .sl-cta-form > button { width: 100% !important; }
        .sl-footer { flex-direction: column !important; gap: 10px !important; text-align: center !important; padding: 24px !important; }
      }
    `}</style>
  );
}
