"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../components/ui-icon";

const navigation: { label: string; href: string; icon: IconName; preview?: boolean }[] = [
  { label: "Overview", href: "/dashboard", icon: "overview" },
  { label: "Protected requests", href: "/dashboard/requests", icon: "requests" },
  { label: "Approvals inbox", href: "/dashboard/approvals", icon: "approvals", preview: true },
  { label: "Document vault", href: "/dashboard/vault", icon: "vault" },
  { label: "Members & owners", href: "/dashboard/members", icon: "members", preview: true },
  { label: "Asset registry", href: "/dashboard/assets", icon: "assets", preview: true },
  { label: "Audit log", href: "/dashboard/audit", icon: "audit", preview: true },
  { label: "Security settings", href: "/dashboard/settings", icon: "settings", preview: true },
];

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const current = navigation.find(item => item.href === pathname)?.label ?? "Workspace";
  const activeMobileLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (window.innerWidth <= 650) activeMobileLink.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);
  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="brand dashboard-brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /></span><span>BusinessVault</span></Link>
        <div className="workspace-switcher"><span className="workspace-icon">BV</span><span><small>Workspace</small><strong>BusinessVault</strong></span></div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">
          <span className="nav-section-label">Workspace</span>
          {navigation.map((item, index) => <span className="dashboard-nav-row" key={item.href}>{index === 2 && <span className="nav-section-label nav-section-spaced">Feature previews</span>}<Link className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} href={item.href}><Icon name={item.icon} size={19} />{item.label}{item.preview && <small>UI</small>}</Link></span>)}
        </nav>
        <div className="sidebar-bottom"><div className="integration-status"><span className="pulse-dot" aria-hidden="true" /><span><small>Enforcement</small><strong>App-level only</strong></span></div><div className="user-chip"><span>BV</span><div><strong>Development workspace</strong><small>Identity shown after sign-in</small></div></div></div>
      </aside>
      <div className="dashboard-main"><header className="dashboard-header"><Link className="mobile-brand" href="/dashboard"><span className="brand-mark" aria-hidden="true"><span /><span /></span>BusinessVault</Link><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{current}</strong></div><nav className="dashboard-mobile-nav" aria-label="Mobile workspace navigation">{navigation.map(item => <Link href={item.href} key={item.href} ref={pathname === item.href ? activeMobileLink : undefined} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav></header>{children}</div>
    </div>
  );
}
