import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sightline — Financial Management for Interior Design Firms" },
      {
        name: "description",
        content:
          "Sightline answers the three questions most designers have never got a straight answer to— what to charge, how to plan, and when to grow.",
      },
      { property: "og:title", content: "Sightline — Financial Management for Interior Design Firms" },
      {
        property: "og:description",
        content:
          "Three questions, one platform. Know your rate, live your numbers, protect your margin.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

/* ------------------------------------------------------------------ */
/* Design tokens already live in src/styles.css as --ch / --gold etc. */
/* Inline styles below use the same hex values where Tailwind tokens   */
/* don't exist (rgba opacity layers, mockup chrome).                   */
/* ------------------------------------------------------------------ */

function HomePage() {
  return (
    <div style={{ background: "var(--cream)", color: "var(--ch)" }}>
      <SiteNav />
      <main>
        <Hero />
        <Tension />
        <ThreeQuestions />
        <Tiers />
        <HowItConnects />
        <Quote />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ============================== NAV ============================== */

function SiteNav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#FFFFFF",
        borderBottom: "1px solid rgba(44,44,44,0.10)",
        padding: "16px 48px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 1px 8px rgba(44,44,44,.05)",
      }}
    >
      <Link
        to="/"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 500,
          color: "var(--ch)",
          letterSpacing: "0.04em",
          textDecoration: "none",
        }}
      >
        Sightline
      </Link>

      <div className="hidden md:flex" style={{ gap: 28 }}>
        {["Foundation", "Studio", "Practice", "Pricing"].map((label) => (
          <a
            key={label}
            href="#tiers"
            style={navCenterLink}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--chl, #777)")}
          >
            {label}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          to="/login"
          aria-label="Sign in to your account"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--ch)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ch)")}
        >
          Sign in
        </Link>
        <Link
          to="/register"
          aria-label="Start your 14-day free trial"
          style={{
            background: "var(--gold)",
            color: "#fff",
            borderRadius: 3,
            padding: "9px 20px",
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            textDecoration: "none",
            transition: "background 0.18s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--goldl)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--gold)")}
        >
          Start free trial
        </Link>
      </div>
    </nav>
  );
}

const navCenterLink: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#777",
  textDecoration: "none",
  transition: "color 0.18s",
};

/* ============================== HERO ============================== */

function Hero() {
  return (
    <section
      style={{
        background: "var(--cream)",
        minHeight: "92vh",
        padding: "80px 48px",
      }}
    >
      <div
        className="hero-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 60,
          alignItems: "center",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div>
          <div style={eyebrowGold}>Built exclusively for interior design firms</div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 62,
              fontWeight: 400,
              lineHeight: 1.06,
              color: "var(--ch)",
              margin: "0 0 24px 0",
            }}
          >
            Finally know if your{" "}
            <em style={{ fontStyle: "italic", color: "var(--gold)" }}>
              firm is working
            </em>{" "}
            for you
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              fontWeight: 300,
              color: "#666",
              lineHeight: 1.85,
              maxWidth: 440,
              marginBottom: 36,
            }}
          >
            Sightline is a financial management platform that answers the three
            questions most designers have never got a straight answer to— what
            to charge, how to plan, and when to grow.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            <Link
              to="/register"
              aria-label="Start your 14-day free trial"
              style={ctaPrimary}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--goldl)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--gold)")}
            >
              Start your 14-day trial
            </Link>
            <a
              href="#how-it-works"
              aria-label="See how Sightline works"
              style={{
                background: "none",
                color: "#777",
                border: "none",
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ch)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#777")}
            >
              See how it works →
            </a>
          </div>

          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10,
              color: "#aaa",
              letterSpacing: "0.06em",
              marginTop: 14,
            }}
          >
            14-day free trial · No credit card required · Cancel any time
          </p>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

const ctaPrimary: React.CSSProperties = {
  background: "var(--gold)",
  color: "#fff",
  border: "none",
  borderRadius: 3,
  padding: "14px 28px",
  fontFamily: "var(--font-sans)",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  textDecoration: "none",
  transition: "background 0.18s",
  display: "inline-block",
};

const eyebrowGold: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--gold)",
  marginBottom: 20,
};

function HeroMockup() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "#2C2C2C",
        border: "1px solid rgba(184,134,11,0.25)",
        borderRadius: 8,
        boxShadow: "0 16px 56px rgba(44,44,44,.22)",
        maxWidth: 480,
        overflow: "hidden",
        marginLeft: "auto",
        marginRight: "auto",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "rgba(0,0,0,0.35)",
          borderBottom: "1px solid rgba(184,134,11,.15)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span
            key={c}
            style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }}
          />
        ))}
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 9,
            color: "rgba(255,255,255,.22)",
            letterSpacing: ".06em",
            marginLeft: 8,
          }}
        >
          Sightline · Firm Dashboard
        </span>
      </div>

      <div style={{ padding: 20 }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: ".2em",
            color: "rgba(255,255,255,.28)",
            marginBottom: 12,
          }}
        >
          RATE ARCHITECTURE
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <MockRateCard
            label="ALIGNED RATE — YOUR FLOOR"
            value="$218"
            decimals=".40"
            valueColor="var(--goldl)"
            bg="rgba(0,0,0,0.3)"
            border="rgba(184,134,11,.3)"
          />
          <MockRateCard
            label="BILLED RATE"
            value="$275"
            decimals=".00"
            valueColor="#fff"
            bg="rgba(255,255,255,.05)"
            border="rgba(184,134,11,.4)"
          />
        </div>

        <div
          style={{
            marginTop: 10,
            background: "rgba(184,134,11,.12)",
            border: "1px solid rgba(184,134,11,.2)",
            borderRadius: 4,
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 8,
                color: "var(--goldl)",
                letterSpacing: ".1em",
              }}
            >
              MARGIN ABOVE FLOOR
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "#fff" }}>
              +$56.60/hr
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: "rgba(255,255,255,.32)" }}>
              +$1,528/week
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 9, color: "rgba(255,255,255,.32)" }}>
              at actual hours
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 10 }}>
          <MockKPI label="UTILIZATION" value="78.4%" valueColor="#7AB890" sub="target 80%" />
          <MockKPI label="WEEKLY MARGIN" value="$4,218" valueColor="var(--goldl)" sub="+$412 vs plan" />
          <MockKPI label="BREAK-EVEN" value="$152.40" valueColor="#fff" sub="$65.60 buffer" />
        </div>
      </div>
    </div>
  );
}

function MockRateCard({
  label,
  value,
  decimals,
  valueColor,
  bg,
  border,
}: {
  label: string;
  value: string;
  decimals: string;
  valueColor: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 5,
        padding: 14,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: ".15em",
          color: "rgba(255,255,255,.38)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 500, color: valueColor }}>
        {value}
        <span style={{ fontSize: 18 }}>{decimals}</span>
      </div>
    </div>
  );
}

function MockKPI({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor: string;
  sub: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 3,
        padding: "9px 10px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: ".12em",
          color: "rgba(255,255,255,.28)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 500, color: valueColor }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 8, color: "rgba(255,255,255,.28)", marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

/* ====================== TENSION ====================== */

function Tension() {
  return (
    <section style={{ background: "#fff", padding: "100px 48px", textAlign: "center" }}>
      <div style={{ width: 48, height: 1, background: "var(--gold)", margin: "0 auto 24px" }} />
      <div style={eyebrowGold}>The financial clarity designers never had</div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 44,
          fontWeight: 400,
          lineHeight: 1.2,
          color: "var(--ch)",
          maxWidth: 720,
          margin: "0 auto 24px",
        }}
      >
        Most design firms are busy.
        <br />
        <em style={{ fontStyle: "italic", color: "var(--gold)" }}>
          Not all of them are profitable.
        </em>
      </h2>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 15,
          fontWeight: 300,
          color: "#666",
          lineHeight: 1.9,
          maxWidth: 660,
          margin: "0 auto",
        }}
      >
        The gap between a full calendar and a healthy business is almost always
        invisible — until it isn't. Sightline makes that gap visible,
        measurable, and actionable before it becomes a crisis.
      </p>
    </section>
  );
}

/* ====================== THREE QUESTIONS ====================== */

function ThreeQuestions() {
  const cols = [
    {
      top: "var(--gold)",
      num: "01",
      q: "What do I need to charge to actually run a healthy business?",
      a: "You've been setting your rate by feel or by what others charge. Sightline computes it from your real cost structure so your rate is always a decision, never a guess.",
      badgeBg: "rgba(184,134,11,.15)",
      badgeColor: "var(--goldl)",
      badge: "Foundation",
    },
    {
      top: "var(--success)",
      num: "02",
      q: "Am I actually hitting my targets, or just staying busy?",
      a: "A full calendar and a profitable firm are not the same thing. Studio gives you a time tracking calendar that connects directly to your financial targets — so you can see whether the hours you're working are translating to the revenue you planned.",
      badgeBg: "rgba(92,138,110,.15)",
      badgeColor: "#7AB890",
      badge: "Studio",
    },
    {
      top: "var(--terra)",
      num: "03",
      q: "Was this project actually profitable — and where did the time go?",
      a: "Projects that feel profitable often aren't. Practice gives you phase-by-phase visibility into where hours went against the scope you set. Scope creep surfaces in dollar terms — not just a vague sense that something ran long.",
      badgeBg: "rgba(196,113,74,.15)",
      badgeColor: "#D4895A",
      badge: "Practice",
    },
  ];

  return (
    <section
      id="three-questions"
      style={{
        background: "#2C2C2C",
        borderTop: "2px solid var(--gold)",
        padding: "80px 48px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: ".22em",
          textTransform: "uppercase",
          color: "var(--goldl)",
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        The three questions every firm owner is really asking
      </div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 38,
          fontWeight: 400,
          color: "#fff",
          textAlign: "center",
          marginBottom: 56,
        }}
      >
        Each question has its own answer
      </h2>

      <div
        className="tq-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 6,
          overflow: "hidden",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        {cols.map((c) => (
          <div
            key={c.num}
            style={{
              background: "rgba(255,255,255,.02)",
              padding: "40px 32px",
              borderTop: `2px solid ${c.top}`,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 64,
                fontWeight: 300,
                color: "rgba(255,255,255,.06)",
                lineHeight: 1,
                marginBottom: 16,
              }}
            >
              {c.num}
            </div>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontStyle: "italic",
                fontWeight: 400,
                color: "#fff",
                lineHeight: 1.4,
                marginBottom: 16,
              }}
            >
              {c.q}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                fontWeight: 300,
                color: "rgba(255,255,255,.45)",
                lineHeight: 1.8,
              }}
            >
              {c.a}
            </p>
            <span
              style={{
                display: "inline-flex",
                marginTop: 24,
                padding: "4px 10px",
                borderRadius: 2,
                fontFamily: "var(--font-sans)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                background: c.badgeBg,
                color: c.badgeColor,
              }}
            >
              {c.badge}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ====================== TIERS ====================== */

function Tiers() {
  return (
    <section id="tiers" style={{ background: "var(--cream)", padding: "100px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ ...eyebrowGold, textAlign: "center", marginBottom: 12 }}>
          Three tiers, one platform, one login
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 40,
            fontWeight: 400,
            color: "var(--ch)",
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          Start where you are. Grow into the rest.
        </h2>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 300,
            color: "#888",
            textAlign: "center",
            maxWidth: 500,
            margin: "0 auto 64px",
          }}
        >
          Each tier includes everything above it. You upgrade when your business
          complexity earns it — not because you hit a feature wall.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TierCard
            badge="Foundation"
            badgeBg="var(--goldp)"
            badgeColor="var(--gold)"
            name="Know your number"
            tagline="For the designer who needs her rate right before anything else."
            price="$49/mo"
            question="What do I need to charge to sustain this business?"
            checkColor="var(--gold)"
            features={[
              "Aligned rate computed from your real cost structure — compensation, expenses, and capacity",
              "Margin above floor — see what your billed rate earns above the minimum",
              "Cost architecture health and break-even",
              "Scenario planning — model decisions before committing",
              "3 to 7 year growth roadmap and hiring threshold analysis",
              "Manual hours log for budget vs actual",
            ]}
            mockup={<FoundationMock />}
          />

          <TierCard
            featured
            badge="Studio"
            badgeBg="#EFF5F1"
            badgeColor="var(--success)"
            name="Live your numbers"
            tagline="For the designer ready to see whether she's executing against her plan."
            price="$89/mo"
            question="Am I hitting my targets, or just staying busy?"
            checkColor="var(--success)"
            features={[
              "Everything in Foundation",
              "Mon–Sun time calendar with billable and non-billable time blocks",
              "Click-to-create entries linked to projects and activity types",
              "Running weekly total — hours needed to hit revenue target, live",
              "Team calendars — individual and combined allocation view",
              "Calendar entries automatically update dashboard utilization and revenue",
            ]}
            mockup={<StudioMock />}
          />

          <TierCard
            badge="Practice"
            badgeBg="#FDF3EC"
            badgeColor="var(--terra)"
            name="Protect your margin"
            tagline="For the firm where per-project profitability is the critical question."
            price="$149/mo"
            question="Was this project profitable — and where did the time go?"
            checkColor="var(--terra)"
            features={[
              "Everything in Studio",
              "Project profitability — scoped vs actual hours, revenue, and margin per project",
              "Scope creep surfaced in dollar terms",
              "SOP library — reusable workflow templates with phases and time benchmarks",
              "Attach SOPs to projects to set the phase budget — time entries fill in against it",
              "Phase-level health indicators with financial impact shown",
            ]}
            mockup={<PracticeMock />}
          />
        </div>
      </div>
    </section>
  );
}

function TierCard({
  featured,
  badge,
  badgeBg,
  badgeColor,
  name,
  tagline,
  price,
  question,
  features,
  checkColor,
  mockup,
}: {
  featured?: boolean;
  badge: string;
  badgeBg: string;
  badgeColor: string;
  name: string;
  tagline: string;
  price: string;
  question: string;
  features: string[];
  checkColor: string;
  mockup: React.ReactNode;
}) {
  return (
    <div
      className="tier-card"
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr 300px",
        border: featured ? "1px solid var(--gold)" : "1px solid rgba(44,44,44,0.10)",
        boxShadow: featured ? "0 0 0 1px var(--gold)" : undefined,
        borderRadius: 6,
        background: "#fff",
        overflow: "hidden",
        transition: "box-shadow .2s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = featured
          ? "0 0 0 1px var(--gold), 0 4px 24px rgba(44,44,44,.08)"
          : "0 4px 24px rgba(44,44,44,.08)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = featured ? "0 0 0 1px var(--gold)" : "")
      }
    >
      <div
        style={{
          borderRight: "1px solid rgba(44,44,44,0.10)",
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          {featured && (
            <div
              style={{
                background: "var(--ch)",
                color: "var(--goldl)",
                fontFamily: "var(--font-sans)",
                fontSize: 8,
                fontWeight: 600,
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 2,
                width: "fit-content",
                marginBottom: 8,
                letterSpacing: ".1em",
              }}
            >
              Most popular
            </div>
          )}
          <span
            style={{
              display: "inline-flex",
              padding: "4px 10px",
              borderRadius: 2,
              fontFamily: "var(--font-sans)",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              background: badgeBg,
              color: badgeColor,
              marginBottom: 16,
            }}
          >
            {badge}
          </span>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 500,
              color: "var(--ch)",
              margin: "0 0 4px 0",
            }}
          >
            {name}
          </h3>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              fontWeight: 300,
              color: "#999",
              lineHeight: 1.6,
              marginBottom: 20,
            }}
          >
            {tagline}
          </p>
        </div>
        <div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#777", marginRight: 6 }}>
            From
          </span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--ch)" }}>
            {price}
          </span>
        </div>
      </div>

      <div style={{ borderRight: "1px solid rgba(44,44,44,0.10)", padding: "32px 28px" }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#777",
            marginBottom: 10,
          }}
        >
          Answers the question
        </div>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontStyle: "italic",
            fontWeight: 400,
            color: "var(--ch)",
            lineHeight: 1.4,
            marginBottom: 16,
          }}
        >
          {question}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {features.map((f, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "5px 0",
                borderBottom: "1px solid rgba(44,44,44,.05)",
                fontFamily: "var(--font-sans)",
                fontSize: 11,
                color: "#555",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: checkColor,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="tier-mock-col" style={{ background: "var(--cream)", padding: "28px 24px" }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 8,
            fontWeight: 600,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "#777",
            marginBottom: 12,
          }}
        >
          What you'll see
        </div>
        {mockup}
      </div>
    </div>
  );
}

function MiniMockShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "#fff",
        border: "1px solid rgba(44,44,44,0.10)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div style={{ background: "var(--ch)", padding: "7px 10px", display: "flex", gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,.3)" }} />
        ))}
      </div>
      <div style={{ padding: 10 }}>{children}</div>
    </div>
  );
}

function FoundationMock() {
  return (
    <MiniMockShell>
      <MiniRow label="Aligned rate" value="$218.40/hr" valueColor="var(--gold)" />
      <MiniRow label="Billed rate" value="$275.00/hr" />
      <MiniRow label="Margin above floor" value="+$56.60/hr" valueColor="var(--success)" />
      <div style={{ marginTop: 8, height: 6, background: "rgba(44,44,44,.06)", borderRadius: 2 }}>
        <div style={{ width: "48%", height: "100%", background: "var(--gold)", borderRadius: 2 }} />
      </div>
    </MiniMockShell>
  );
}

function MiniRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontFamily: "var(--font-sans)",
        fontSize: 10,
      }}
    >
      <span style={{ color: "#777" }}>{label}</span>
      <span style={{ color: valueColor ?? "var(--ch)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function StudioMock() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const blocks: Record<number, string> = {
    0: "var(--success)",
    1: "var(--terra)",
    2: "var(--success)",
    3: "var(--success)",
  };
  return (
    <MiniMockShell>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {days.map((d, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 8, color: "#aaa" }}>{d}</div>
            <div
              style={{
                marginTop: 3,
                height: 28,
                borderRadius: 2,
                background: blocks[i] ?? "rgba(44,44,44,.05)",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontFamily: "var(--font-sans)", fontSize: 9, color: "#777" }}>
        27.5 hrs billable · 4.5 hrs to target
      </div>
    </MiniMockShell>
  );
}

function PracticeMock() {
  const rows = [
    { name: "Client kickoff", status: "Over", color: "var(--terra)", pct: 110 },
    { name: "Space planning", status: "On track", color: "var(--success)", pct: 55 },
    { name: "FF&E sourcing", status: "On track", color: "var(--success)", pct: 32 },
  ];
  return (
    <MiniMockShell>
      {rows.map((r) => (
        <div key={r.name} style={{ marginBottom: 6 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-sans)",
              fontSize: 10,
              color: "#555",
            }}
          >
            <span>{r.name}</span>
            <span style={{ color: r.color }}>{r.status}</span>
          </div>
          <div style={{ marginTop: 3, height: 4, background: "rgba(44,44,44,.06)", borderRadius: 2 }}>
            <div
              style={{
                width: `${Math.min(r.pct, 100)}%`,
                height: "100%",
                background: r.color,
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 6, fontFamily: "var(--font-sans)", fontSize: 9, color: "var(--success)" }}>
        $2,840 actual margin
      </div>
    </MiniMockShell>
  );
}

/* ====================== HOW IT CONNECTS ====================== */

function HowItConnects() {
  const steps = [
    {
      num: "1",
      title: "You log time on a project",
      body: "A single entry carries a project, a phase, a team member, and a billable flag. Enter it once from the calendar or directly from a project phase.",
    },
    {
      num: "2",
      title: "Your dashboard updates",
      body: "Utilization, fee earned to date, and budget vs actual figures recalculate immediately. No syncing. No exports. The same entry appears on the calendar and on the dashboard.",
    },
    {
      num: "3",
      title: "Your project knows",
      body: "Phase actual hours increment. If hours exceed the SOP budget, scope creep surfaces in dollar terms. Your profit picture updates in real time — not at project close.",
    },
  ];

  return (
    <section id="how-it-works" style={{ background: "#fff", padding: "100px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ ...eyebrowGold, textAlign: "center", marginBottom: 12 }}>
          One platform, one data layer
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 40,
            fontWeight: 400,
            color: "var(--ch)",
            textAlign: "center",
            marginBottom: 64,
          }}
        >
          Time you log feeds everything. Automatically.
        </h2>

        <div
          className="how-row"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 40,
            maxWidth: 900,
            margin: "0 auto",
            position: "relative",
          }}
        >
          {steps.map((s) => (
            <div key={s.num} style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "1px solid rgba(44,44,44,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  fontWeight: 500,
                  color: "var(--gold)",
                }}
              >
                {s.num}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 20,
                  fontWeight: 500,
                  color: "var(--ch)",
                  marginBottom: 10,
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  fontWeight: 300,
                  color: "#888",
                  lineHeight: 1.8,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ====================== QUOTE ====================== */

function Quote() {
  return (
    <section style={{ background: "var(--cream)", padding: "100px 48px", textAlign: "center" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 80,
            fontWeight: 300,
            color: "var(--goldp)",
            lineHeight: 0.8,
            marginBottom: 16,
          }}
        >
          “
        </div>
        <blockquote
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--ch)",
            lineHeight: 1.6,
            marginBottom: 24,
            margin: 0,
          }}
        >
          I've been running my firm for six years. Sightline is the first tool
          that explained my own business to me in a way I could actually use.
        </blockquote>
        <div
          style={{
            marginTop: 24,
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "#bbb",
          }}
        >
          Interior design firm principal · 3-person studio
        </div>
      </div>
    </section>
  );
}

/* ====================== FINAL CTA ====================== */

function FinalCTA() {
  return (
    <section
      style={{
        background: "#2C2C2C",
        padding: "100px 48px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 50% 80% at 50% 100%, rgba(184,134,11,.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: ".22em",
            textTransform: "uppercase",
            color: "var(--goldl)",
            marginBottom: 20,
          }}
        >
          14 days free · No credit card to start
        </div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 50,
            fontWeight: 400,
            fontStyle: "italic",
            color: "#fff",
            lineHeight: 1.2,
            marginBottom: 20,
          }}
        >
          Start with what you need right now
        </h2>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          <TierPill bg="rgba(184,134,11,.15)" color="var(--goldl)">Foundation</TierPill>
          <span style={{ color: "rgba(255,255,255,.2)" }}>→</span>
          <TierPill bg="rgba(92,138,110,.15)" color="#7AB890">Studio</TierPill>
          <span style={{ color: "rgba(255,255,255,.2)" }}>→</span>
          <TierPill bg="rgba(196,113,74,.15)" color="#D4895A">Practice</TierPill>
        </div>

        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 300,
            color: "rgba(255,255,255,.45)",
            lineHeight: 1.8,
            marginBottom: 36,
            maxWidth: 480,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Begin at Foundation. Add Studio when you're ready to track whether
          you're living your numbers. Add Practice when project-level
          profitability becomes the question that keeps you up at night.
        </p>

        <Link
          to="/register"
          aria-label="Start your 14-day free trial"
          style={{
            ...ctaPrimary,
            padding: "15px 36px",
            letterSpacing: ".14em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--goldl)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--gold)")}
        >
          Start your free trial
        </Link>
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            color: "rgba(255,255,255,.2)",
            letterSpacing: ".06em",
            marginTop: 14,
          }}
        >
          14-day trial · Auto-converts if not canceled · Cancel any time
        </p>
      </div>
    </section>
  );
}

function TierPill({
  bg,
  color,
  children,
}: {
  bg: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        background: bg,
        color,
        padding: "5px 14px",
        borderRadius: 2,
        fontFamily: "var(--font-sans)",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: ".14em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

/* ====================== FOOTER ====================== */

function SiteFooter() {
  const cols: { header: string; links: string[] }[] = [
    { header: "PRODUCT", links: ["Foundation", "Studio", "Practice", "Pricing", "Knowledge Base"] },
    { header: "COMPANY", links: ["About", "Propos'Ability", "Contact"] },
    { header: "LEGAL", links: ["Privacy policy", "Terms of service", "Security"] },
  ];

  return (
    <footer style={{ background: "#1E1E1E", borderTop: "1px solid rgba(184,134,11,.15)" }}>
      <div
        className="footer-grid"
        style={{
          padding: 48,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 40,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 500,
              color: "#fff",
              letterSpacing: ".04em",
              marginBottom: 8,
            }}
          >
            Sightline
          </div>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 10,
              fontWeight: 300,
              color: "rgba(255,255,255,.3)",
              lineHeight: 1.6,
              maxWidth: 200,
            }}
          >
            Financial clarity for interior design firms. One platform. Three
            questions.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.header}>
            <div
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: ".16em",
                color: "rgba(255,255,255,.3)",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              {c.header}
            </div>
            {c.links.map((l) => (
              <a
                key={l}
                href="#"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  display: "block",
                  color: "rgba(255,255,255,.45)",
                  marginBottom: 8,
                  textDecoration: "none",
                  transition: "color .18s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--goldl)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.45)")}
              >
                {l}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,.06)",
          padding: "20px 48px",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "rgba(255,255,255,.2)" }}>
          © 2025 Propos'Ability · Sightline
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "rgba(255,255,255,.2)" }}>
          Built for interior design firm owners
        </span>
      </div>

      {/* Tiny responsive layer — kept scoped to the homepage. */}
      <style>{`
        @media (max-width: 1024px) {
          .tier-card { grid-template-columns: 220px 1fr !important; }
          .tier-card .tier-mock-col { display: none !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-grid h1 { font-size: 42px !important; }
          .tq-grid { grid-template-columns: 1fr !important; }
          .tier-card { grid-template-columns: 1fr !important; }
          .how-row { grid-template-columns: 1fr !important; }
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}