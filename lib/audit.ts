import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
  return value;
}

function hashEvent(input: { organizationId: string; actorId: string | null; action: string; target: string; eventJson: unknown; occurredAt: Date; previousEventHash: string | null }) {
  return createHash("sha256").update(JSON.stringify(canonicalize({ organizationId: input.organizationId, actorId: input.actorId, action: input.action, target: input.target, eventJson: input.eventJson, occurredAt: input.occurredAt.toISOString(), previous: input.previousEventHash }))).digest("hex");
}

export async function appendAudit(tx: Prisma.TransactionClient, organizationId: string, actorId: string | null, action: string, target: string, eventJson: Prisma.InputJsonValue) {
  // A row write makes stale serializable snapshots retry before reading the chain head.
  await tx.$executeRaw`UPDATE "Organization" SET "updatedAt" = "updatedAt" WHERE id = ${organizationId}`;
  const previous = await tx.auditEvent.findFirst({ where: { organizationId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { eventHash: true, occurredAt: true } });
  const occurredAt = new Date(Math.max(Date.now(), previous ? previous.occurredAt.getTime() + 1 : 0));
  const eventHash = hashEvent({ organizationId, actorId, action, target, eventJson, occurredAt, previousEventHash: previous?.eventHash ?? null });
  return tx.auditEvent.create({ data: { organizationId, actorId, action, target, correlationId: randomUUID(), eventJson, occurredAt, previousEventHash: previous?.eventHash, eventHash, hashVersion: 2 } });
}

export async function verifyAuditChain(organizationId: string) {
  const events = await db.auditEvent.findMany({ where: { organizationId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  let previous: string | null = null;
  let legacyUnverifiable = 0;
  for (const event of events) {
    if (event.previousEventHash !== previous) return { linksValid: false, currentHashesValid: false, legacyUnverifiable, firstInvalidId: event.id };
    if (event.hashVersion === 2) {
      const digest = hashEvent(event);
      if (digest !== event.eventHash) return { linksValid: true, currentHashesValid: false, legacyUnverifiable, firstInvalidId: event.id };
    } else legacyUnverifiable++;
    previous = event.eventHash;
  }
  return { linksValid: true, currentHashesValid: true, legacyUnverifiable, firstInvalidId: null };
}
