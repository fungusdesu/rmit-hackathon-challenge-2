import { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";
import { db } from "./db";
import type { Principal } from "./auth/types";

export async function getOrCreateUser(principal: Principal) {
  return db.user.upsert({
    where: { tideSubject: principal.subject },
    update: { displayName: principal.displayName, email: principal.email },
    create: { tideSubject: principal.subject, displayName: principal.displayName, email: principal.email },
  });
}

export async function listOrganizations(principal: Principal) {
  return db.organization.findMany({
    where: { memberships: { some: { user: { tideSubject: principal.subject }, status: MembershipStatus.ACTIVE } } },
    orderBy: { createdAt: "asc" },
    include: { memberships: { where: { status: MembershipStatus.ACTIVE }, select: { role: true } } },
  });
}

export async function getMembership(organizationId: string, principal: Principal) {
  return db.membership.findFirst({
    where: { organizationId, status: MembershipStatus.ACTIVE, user: { tideSubject: principal.subject } },
  });
}

export async function createOrganization(principal: Principal, input: { name: string; description?: string }) {
  const user = await getOrCreateUser(principal);

  return db.organization.create({
    data: {
      name: input.name,
      description: input.description,
      setupStatus: "INITIALIZING",
      memberships: { create: { userId: user.id, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE, joinedAt: new Date() } },
      policies: { create: { operationType: "REMOVE_OWNER", requiredApprovals: 2, eligibleRoles: [MembershipRole.OWNER], forbidSelfApproval: true, ttlSeconds: 86400, version: 1 } },
    },
    include: { memberships: { include: { user: true } } },
  });
}

export async function getOrganization(organizationId: string, principal: Principal) {
  const membership = await getMembership(organizationId, principal);
  if (!membership) return null;

  return db.organization.findUnique({
    where: { id: organizationId },
    include: {
      memberships: { where: { status: MembershipStatus.ACTIVE }, include: { user: true }, orderBy: { createdAt: "asc" } },
      policies: { where: { active: true }, orderBy: { operationType: "asc" } },
    },
  });
}

export function parseOrganizationInput(body: unknown): { name: string; description?: string } {
  if (!body || typeof body !== "object") throw new Error("Request body must be an object");
  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : undefined;
  if (name.length < 2 || name.length > 120) throw new Error("Organization name must be between 2 and 120 characters");
  if (description && description.length > 500) throw new Error("Organization description cannot exceed 500 characters");
  return { name, description: description || undefined };
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
