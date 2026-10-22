"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const available = [
  { label: "Overview", href: "/dashboard", glyph: "glyph-0" },
  { label: "Requests", href: "/dashboard/requests", glyph: "glyph-1" },
];
const planned = ["Approvals inbox", "Vault", "Members & owners", "Asset registry", "Audit log", "Settings"];

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const current = available.find(item => item.href === pathname)?.label ?? "Workspace";
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="brand dashboard-brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /></span><span>BusinessVault</span></Link>
        <div className="workspace-switcher"><span className="workspace-icon">BV</span><span><small>Workspace</small><strong>BusinessVault</strong></span></div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">
          <span className="nav-section-label">Workspace</span>
          {available.map(item => <Link className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} href={item.href} key={item.href}><span className={`nav-glyph ${item.glyph}`} aria-hidden="true" />{item.label}</Link>)}
          <span className="nav-section-label nav-section-spaced">Planned</span>
          {planned.map((label, index) => <span className="dashboard-nav-planned" key={label}><span className={`nav-glyph glyph-${index + 2}`} aria-hidden="true" />{label}<small>soon</small></span>)}
        </nav>
        <div className="sidebar-bottom"><div className="integration-status"><span className="pulse-dot" aria-hidden="true" /><span><small>Enforcement</small><strong>App-level only</strong></span></div><div className="user-chip"><span>BV</span><div><strong>Development workspace</strong><small>Identity shown after sign-in</small></div></div></div>
      </aside>
      <div className="dashboard-main"><header className="dashboard-header"><Link className="mobile-brand" href="/dashboard"><span className="brand-mark" aria-hidden="true"><span /><span /></span>BusinessVault</Link><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{current}</strong></div><nav className="dashboard-mobile-nav" aria-label="Mobile workspace navigation">{available.map(item => <Link href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav></header>{children}</div>
    </div>
  );
}
