ALTER TABLE "AuditEvent" ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1;

INSERT INTO "Policy" (id, "organizationId", "operationType", "requiredApprovals", "eligibleRoles", "forbidSelfApproval", "ttlSeconds", version, active, "createdAt")
SELECT 'gov_' || substr(md5(o.id || p.operation || clock_timestamp()::text), 1, 24), o.id, p.operation, 2, '["OWNER"]'::jsonb, true, 86400, 1, true, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES ('INVITE_PRIVILEGED_MEMBER'), ('CHANGE_PRIVILEGED_MEMBERSHIP'), ('UPDATE_POLICY')) AS p(operation)
WHERE NOT EXISTS (SELECT 1 FROM "Policy" existing WHERE existing."organizationId" = o.id AND existing."operationType" = p.operation);

UPDATE "Organization" o SET "setupStatus" = 'ACTIVE'
WHERE (SELECT count(*) FROM "Membership" m WHERE m."organizationId" = o.id AND m.role = 'OWNER' AND m.status = 'ACTIVE') >= 3;
