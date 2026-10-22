import type { ReactNode, SVGProps } from "react";

export type IconName = "overview" | "requests" | "approvals" | "vault" | "members" | "assets" | "audit" | "settings" | "shield" | "arrow" | "search" | "file" | "clock" | "check" | "spark" | "key" | "filter";

export default function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    requests: <><path d="M8 3h8l4 4v14H4V3h4Z" /><path d="M15 3v5h5M8 12h8M8 16h6" /></>,
    approvals: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    vault: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M12 9V7m0 8v2m-3-5H7m10 0h-2" /></>,
    members: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm12-14a3 3 0 0 1 0 6m2 3a5 5 0 0 1 4 5h-4" /></>,
    assets: <><rect x="3" y="4" width="8" height="7" rx="1" /><rect x="13" y="4" width="8" height="7" rx="1" /><rect x="8" y="15" width="8" height="6" rx="1" /><path d="M7 11v2h10v-2m-5 2v2" /></>,
    audit: <><path d="M6 3h12v18H6zM9 8h6m-6 4h6m-6 4h4" /><path d="m15 16 1.5 1.5L20 14" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="16" cy="17" r="2" fill="currentColor" stroke="none" /></>,
    shield: <><path d="M12 2 4 5v6c0 5 3.2 8.7 8 11 4.8-2.3 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    file: <><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8m-8 4h6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Zm7 15 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9 2 2-2 2 1 2-2 2-2-1-3 3" /></>,
    filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
