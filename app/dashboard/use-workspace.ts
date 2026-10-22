"use client";

import { useCallback, useEffect, useState } from "react";

export type Organization = { id: string; name: string; description: string | null; setupStatus: string };
export type Summary = { pendingApprovals: number; protectedDocuments: number; activeOwners: number; securityEvents: number };
export type ActionRequest = {
  id: string;
  operationType: string;
  status: string;
  targetId: string;
  canonicalPayload: Record<string, unknown>;
  payloadDigest: string;
  requester: { displayName: string; email: string | null };
  approvals: { id: string; decision: string; approver: { displayName: string; email: string | null } }[];
  createdAt: string;
  expiresAt: string;
};

export type AuditEventItem = { id: string; action: string; target: string; actorId: string | null; occurredAt: string };
export type PolicyItem = { id: string; operationType: string; requiredApprovals: number; active?: boolean };
export type SessionPrincipal = { subject: string; displayName: string; email: string | null; source: string };

/** Signed-in principal from /api/auth/session (Tide mode) or the dev subject (development mode). */
export function useSessionPrincipal() {
  const [principal, setPrincipal] = useState<SessionPrincipal | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (active && data?.principal) setPrincipal(data.principal as SessionPrincipal); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  return principal;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session is missing or has expired. Sign in to continue.");
    if (response.status === 403) throw new Error("You do not have access to this action.");
    if (response.status === 404) throw new Error("This organization or request is no longer available.");
    throw new Error(typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error.replaceAll("_", " ") : "The request failed. Please try again.");
  }
  return data as T;
}

export function useWorkspace() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<{ organizations: Organization[] }>("/api/organizations");
      setOrganizations(data.organizations);
      setOrganizationId(current => {
        const stored = window.sessionStorage.getItem("businessvault-organization");
        return data.organizations.find(item => item.id === current)?.id
          ?? data.organizations.find(item => item.id === stored)?.id
          ?? data.organizations[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load organizations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectOrganization = (id: string) => {
    if (!organizations.some(item => item.id === id)) return;
    setOrganizationId(id);
    window.sessionStorage.setItem("businessvault-organization", id);
  };

  const createOrganization = async (name: string, description: string) => {
    const data = await apiJson<{ organization: Organization }>("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setOrganizations(items => [...items, data.organization]);
    setOrganizationId(data.organization.id);
    window.sessionStorage.setItem("businessvault-organization", data.organization.id);
  };

  return {
    organizations,
    organization: organizations.find(item => item.id === organizationId) ?? null,
    organizationId,
    loading,
    error,
    refresh,
    selectOrganization,
    createOrganization,
  };
}
