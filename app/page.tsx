import HeroScene from "./components/hero-scene";

export default function Home() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BusinessVault home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>BusinessVault</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#security">Security</a>
          <a href="/dashboard">Workspace</a>
          <a href="#status">Status</a>
        </nav>
        <div className="nav-actions">
          <a className="sign-in" href="/auth/login">Sign in</a>
          <a className="button button-small" href="/dashboard">Open workspace <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> Governance infrastructure for modern teams</div>
            <h1 id="hero-title">Critical access should never depend on one person.</h1>
            <p className="intro">
              BusinessVault gives organizations a clear, accountable way to govern shared digital assets,
              approve high-risk actions, and protect sensitive data.
            </p>
            <div className="hero-actions">
              <a className="button" href="/dashboard">Explore workspace <span aria-hidden="true">↗</span></a>
              <a className="text-link" href="#platform">Explore the platform <span aria-hidden="true">→</span></a>
            </div>
            <p className="microcopy"><span className="lock-icon" aria-hidden="true">▣</span> Built for owner-led companies and security-conscious teams</p>
          </div>

          <HeroScene />
        </section>

        <section className="proof-strip" aria-label="Security principles">
          <span className="proof-label">One control plane for your most important assets</span>
          <div className="proof-items"><span><b>01</b> Shared ownership</span><span><b>02</b> Explicit approvals</span><span><b>03</b> Auditable actions</span></div>
        </section>

        <section className="platform-section" id="platform" aria-labelledby="platform-title">
          <div className="section-heading"><div><span className="overline">The platform</span><h2 id="platform-title">Make shared control<br /><em>actually shared.</em></h2></div><p>Replace fragile admin conventions with an operating layer designed for organizations that own things together.</p></div>
          <div className="feature-grid">
            <article className="feature-card feature-card-large"><div className="feature-number">01</div><div className="feature-icon approval-icon"><span /><span /><span /></div><h3>Govern high-impact actions</h3><p>Separate the person who requests an action from the people who authorize it. Every decision is tied to exact parameters, policy, and expiry.</p><a href="#security">Explore approvals <span>→</span></a></article>
            <article className="feature-card"><div className="feature-number">02</div><div className="feature-icon vault-icon">◇</div><h3>Keep sensitive data private</h3><p>A browser-encrypted document vault is planned. Its Tide encryption flow still needs a verified end-to-end test.</p><a href="#security">See the security model <span>→</span></a></article>
            <article className="feature-card"><div className="feature-number">03</div><div className="feature-icon audit-icon"><span /><span /><span /></div><h3>Know what happened</h3><p>Give owners a shared, reliable record of requests, decisions, and execution outcomes.</p><a href="#status">View audit model <span>→</span></a></article>
          </div>
        </section>

        <section className="security-band" id="security" aria-labelledby="security-title">
          <div><span className="overline">Security by design</span><h2 id="security-title">Designing shared control for your most critical business assets.</h2></div>
          <div className="security-points"><div><span className="point-icon">↗</span><p><strong>Server-side enforcement</strong><br />UI approvals are never treated as authority.</p></div><div><span className="point-icon">⌁</span><p><strong>Tenant isolation</strong><br />Every resource is scoped to its organization.</p></div><div><span className="point-icon">◌</span><p><strong>Honest boundaries</strong><br />We show what is protected and what is not.</p></div></div>
        </section>

        <section className="closing-section" id="access"><span className="overline">The foundation is ready</span><h2>Shared assets deserve<br />shared authority.</h2><a className="button" href="/dashboard">Open workspace <span aria-hidden="true">↗</span></a></section>
      </main>

      <footer className="footer" id="status"><div className="footer-brand"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /><span /></span><span>BusinessVault</span></a><p>Governance infrastructure for shared business assets.</p></div><div className="footer-links"><div><span>Product</span><a href="#platform">Platform</a><a href="#security">Security</a></div><div><span>Explore</span><a href="/dashboard">Workspace</a><a href="/auth/login">Sign in</a></div><div><span>Company</span><a href="#top">About BusinessVault</a><a href="#security">Security approach</a></div></div><div className="footer-bottom"><span>© 2026 BusinessVault</span><span>Designed for shared ownership.</span></div></footer>
    </div>
  );
}
