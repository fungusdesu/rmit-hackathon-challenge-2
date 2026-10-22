import HeroScene from "./components/hero-scene";
import NetworkBackground from "./components/network-background";
import Icon from "./components/ui-icon";

export default function Home() {
  return (
    <div className="site-shell">
      <NetworkBackground />
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
              <a className="text-link" href="#platform">Explore the platform <Icon name="arrow" size={17} /></a>
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
            <article className="feature-card feature-card-large"><div className="feature-number">01 / GOVERNANCE</div><div className="feature-icon"><Icon name="approvals" size={42} /></div><h3>Govern high-impact actions</h3><p>Separate the person who requests an action from the people who authorize it. Every decision is tied to exact parameters, policy, and expiry.</p><a href="/dashboard/approvals">Explore approvals <Icon name="arrow" size={16} /></a></article>
            <article className="feature-card"><div className="feature-number">02 / INFORMATION</div><div className="feature-icon"><Icon name="vault" size={42} /></div><h3>Keep sensitive data private</h3><p>A browser-encrypted document vault is planned. Its Tide encryption flow still needs a verified end-to-end test.</p><a href="/dashboard/vault">Preview the vault <Icon name="arrow" size={16} /></a></article>
            <article className="feature-card"><div className="feature-number">03 / EVIDENCE</div><div className="feature-icon"><Icon name="audit" size={42} /></div><h3>Know what happened</h3><p>Give owners a shared record of requests, decisions, and execution outcomes, with a path to stronger evidence.</p><a href="/dashboard/audit">Preview the audit log <Icon name="arrow" size={16} /></a></article>
          </div>
        </section>

        <section className="module-section" id="modules" aria-labelledby="modules-title"><div className="section-heading"><div><span className="overline">Inside the workspace</span><h2 id="modules-title">One connected view<br /><em>of what matters.</em></h2></div><p>Explore working interface concepts for the people, assets, policies, and decisions that shape your business.</p></div><div className="module-grid"><a href="/dashboard/members"><Icon name="members" size={28} /><span><strong>Members & owners</strong><small>Roles, departments, succession</small></span><Icon name="arrow" size={18} /></a><a href="/dashboard/assets"><Icon name="assets" size={28} /><span><strong>Asset registry</strong><small>Providers, ownership, control scope</small></span><Icon name="arrow" size={18} /></a><a href="/dashboard/settings"><Icon name="settings" size={28} /><span><strong>Security settings</strong><small>Thresholds, recovery, policy design</small></span><Icon name="arrow" size={18} /></a></div><p className="module-note">Feature screens show illustrative data; active organization and request flows use the current APIs.</p></section>

        <section className="security-band" id="security" aria-labelledby="security-title">
          <div><span className="overline">Security by design</span><h2 id="security-title">Designing shared control for your most critical business assets.</h2></div>
          <div className="security-points"><div><span className="point-icon"><Icon name="shield" size={25} /></span><p><strong>Server-side enforcement</strong><br />UI approvals are never treated as authority.</p></div><div><span className="point-icon"><Icon name="members" size={25} /></span><p><strong>Tenant isolation</strong><br />Every resource is scoped to its organization.</p></div><div><span className="point-icon"><Icon name="audit" size={25} /></span><p><strong>Honest boundaries</strong><br />We show what is protected and what is not.</p></div></div>
        </section>

        <section className="closing-section" id="access"><span className="overline">The foundation is ready</span><h2>Shared assets deserve<br />shared authority.</h2><a className="button" href="/dashboard">Open workspace <span aria-hidden="true">↗</span></a></section>
      </main>

      <footer className="footer" id="status"><div className="footer-brand"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true"><span /><span /></span><span>BusinessVault</span></a><p>Governance infrastructure for shared business assets.</p></div><div className="footer-links"><div><span>Product</span><a href="#platform">Platform</a><a href="#security">Security</a></div><div><span>Explore</span><a href="/dashboard">Workspace</a><a href="/auth/login">Sign in</a></div><div><span>Company</span><a href="#top">About BusinessVault</a><a href="#security">Security approach</a></div></div><div className="footer-bottom"><span>© 2026 BusinessVault</span><span>Designed for shared ownership.</span></div></footer>
    </div>
  );
}
