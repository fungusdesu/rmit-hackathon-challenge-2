"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "../components/ui-icon";
import { useSessionPrincipal } from "./use-workspace";
import DevUserSwitcher from "./dev-user-switcher";

const navigation: { label: string; href: string; icon: IconName; preview?: boolean }[] = [
  { label: "Overview", href: "/dashboard", icon: "overview" },
  { label: "Protected requests", href: "/dashboard/requests", icon: "requests" },
  { label: "Approvals inbox", href: "/dashboard/approvals", icon: "approvals" },
  { label: "Document vault", href: "/dashboard/vault", icon: "vault" },
  { label: "Members & owners", href: "/dashboard/members", icon: "members" },
  { label: "Asset registry", href: "/dashboard/assets", icon: "assets" },
  { label: "Audit log", href: "/dashboard/audit", icon: "audit" },
  { label: "Security settings", href: "/dashboard/settings", icon: "settings" },
];

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const principal = useSessionPrincipal();
  const initials = (principal?.displayName ?? "BV").split(/\s+/).map(part => part[0] ?? "").join("").slice(0, 2).toUpperCase();
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
          {navigation.map((item, index) => <span className="dashboard-nav-row" key={item.href}>{index === 2 && <span className="nav-section-label nav-section-spaced">Governance</span>}<Link className={pathname === item.href ? "active" : ""} aria-current={pathname === item.href ? "page" : undefined} href={item.href}><Icon name={item.icon} size={19} />{item.label}{item.preview && <small>UI</small>}</Link></span>)}
        </nav>
        <div className="sidebar-bottom"><div className="integration-status"><span className="pulse-dot" aria-hidden="true" /><span><small>Enforcement</small><strong>App-level only</strong></span></div><div className="user-chip"><span>{initials}</span><div><strong>{principal?.displayName ?? "Not signed in"}</strong><small>{principal ? `${principal.email ?? principal.subject}${principal.source === "development" ? " · dev mode" : ""}` : "Sign in to see your identity"}</small></div></div></div>
      </aside>
      <div className="dashboard-main"><header className="dashboard-header"><Link className="mobile-brand" href="/dashboard"><span className="brand-mark" aria-hidden="true"><span /><span /></span>BusinessVault</Link><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{current}</strong></div><nav className="dashboard-mobile-nav" aria-label="Mobile workspace navigation">{navigation.map(item => <Link href={item.href} key={item.href} ref={pathname === item.href ? activeMobileLink : undefined} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav><DevUserSwitcher /></header>{children}</div>
    </div>
  );
}
