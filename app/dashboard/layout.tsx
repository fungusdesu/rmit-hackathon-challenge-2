import Link from "next/link";

const navigation = [
  ["Overview", "/dashboard"],
  ["My requests", "/dashboard/requests"],
  ["Approvals", "/dashboard/approvals"],
  ["Vault", "/dashboard/vault"],
  ["Members & owners", "/dashboard/members"],
  ["Asset registry", "/dashboard/assets"],
  ["Audit log", "/dashboard/audit"],
];

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="brand dashboard-brand" href="/">
          <span className="brand-mark" aria-hidden="true"><span /><span /></span>
          <span>BusinessVault</span>
        </Link>
        <div className="workspace-switcher"><span className="workspace-icon">N</span><span><small>Workspace</small><strong>Northstar Labs</strong></span><b>⌄</b></div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">
          <span className="nav-section-label">Workspace</span>
          {navigation.map(([label, href], index) => <Link className={index === 0 ? "active" : ""} href={href} key={href}><span className={`nav-glyph glyph-${index}`} />{label}{label === "Approvals" && <em>3</em>}</Link>)}
          <span className="nav-section-label nav-section-spaced">Organization</span>
          <Link href="/dashboard/settings"><span className="nav-glyph glyph-settings" />Settings</Link>
        </nav>
        <div className="sidebar-bottom"><div className="integration-status"><span className="pulse-dot" /><span><small>System status</small><strong>All systems operational</strong></span></div><div className="user-chip"><span>AM</span><div><strong>Alex Morgan</strong><small>Owner</small></div><b>•••</b></div></div>
      </aside>
      <div className="dashboard-main"><header className="dashboard-header"><div className="mobile-brand"><span className="brand-mark" aria-hidden="true"><span /><span /></span>BusinessVault</div><div className="breadcrumb"><span>Northstar Labs</span><b>/</b><strong>Overview</strong></div><div className="header-actions"><button aria-label="Search">⌕</button><button aria-label="Notifications" className="notification-button">♧<i /></button><span className="header-avatar">AM</span></div></header>{children}</div>
    </div>
  );
}
