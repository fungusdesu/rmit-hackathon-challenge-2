import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.env.GOVERNANCE_TEST_BASE_URL;
if (!base) throw new Error("Set GOVERNANCE_TEST_BASE_URL to a running development-auth BusinessVault server");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the test database");

const db = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const people = Object.fromEntries(["a", "b", "c", "d", "employee", "outsider"].map((name) => [name, { subject: `test-${suffix}-${name}`, email: `${name}-${suffix}@example.test` }]));

async function api(person, method, path, body) {
  const headers = { "x-dev-user-subject": person.subject, "x-dev-user-email": person.email, "x-dev-user-email-verified": "true" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

function tokenFrom(url) { return new URLSearchParams(new URL(url).hash.slice(1)).get("token"); }
function key() { return randomUUID(); }

test("governance invitation, policy, isolation and execution boundaries", async () => {
  const created = await api(people.a, "POST", "/api/organizations", { name: `Governance ${suffix}` });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const org = created.body.organization;
  const root = `/api/organizations/${org.id}`;
  assert.equal((await api(people.outsider, "GET", `${root}/members`)).status, 404);

  const invites = {};
  for (const name of ["b", "c", "d"]) {
    const response = await api(people.a, "POST", `${root}/invitations`, { email: people[name].email, role: "OWNER" });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    invites[name] = tokenFrom(response.body.acceptanceUrl);
  }
  const wrongEmail = await api(people.outsider, "POST", "/api/invitations/accept", { token: invites.b });
  assert.equal(wrongEmail.status, 403);
  const unverified = await fetch(`${base}/api/invitations/accept`, { method: "POST", headers: { "content-type": "application/json", "x-dev-user-subject": people.b.subject, "x-dev-user-email": people.b.email, "x-dev-user-email-verified": "false" }, body: JSON.stringify({ token: invites.b }) });
  assert.equal(unverified.status, 403);
  for (const name of ["b", "c"]) assert.equal((await api(people[name], "POST", "/api/invitations/accept", { token: invites[name] })).status, 201);
  assert.equal((await api(people.b, "POST", "/api/invitations/accept", { token: invites.b })).status, 404);
  assert.equal((await api(people.d, "POST", "/api/invitations/accept", { token: invites.d })).status, 404);
  assert.equal((await api(people.a, "GET", root)).body.organization.setupStatus, "ACTIVE");
  assert.equal((await api(people.a, "POST", `${root}/invitations`, { email: people.d.email, role: "OWNER" })).status, 409);

  const inviteRequest = await api(people.a, "POST", `${root}/requests`, { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: key(), payload: { email: people.d.email, role: "OWNER", reason: "Add fourth owner" } });
  assert.equal(inviteRequest.status, 201, JSON.stringify(inviteRequest.body));
  const inviteId = inviteRequest.body.request.id;
  assert.equal((await api(people.a, "POST", `${root}/requests/${inviteId}/approve`)).status, 403);
  assert.equal((await api(people.b, "POST", `${root}/requests/${inviteId}/approve`)).status, 201);
  assert.equal((await api(people.b, "POST", `${root}/requests/${inviteId}/approve`)).status, 409);
  assert.equal((await api(people.c, "POST", `${root}/requests/${inviteId}/approve`)).status, 201);
  const issued = await api(people.a, "POST", `${root}/requests/${inviteId}/execute`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.equal(issued.body.enforcement, "APP-LEVEL APPROVAL ONLY");
  assert.equal((await api(people.d, "POST", "/api/invitations/accept", { token: tokenFrom(issued.body.acceptanceUrl) })).status, 201);

  const ownerMembership = (await api(people.a, "GET", `${root}/members`)).body.members.find((member) => member.user.email === people.d.email);
  assert.equal((await api(people.a, "PATCH", `${root}/members/${ownerMembership.id}`, { status: "SUSPENDED", reason: "Direct API bypass" })).status, 409);
  const suspendOwner = await api(people.a, "POST", `${root}/requests`, { operationType: "CHANGE_PRIVILEGED_MEMBERSHIP", idempotencyKey: key(), payload: { memberId: ownerMembership.id, status: "SUSPENDED", reason: "Temporary owner suspension" } });
  assert.equal(suspendOwner.status, 201);
  assert.equal((await api(people.d, "POST", `${root}/requests/${suspendOwner.body.request.id}/approve`)).status, 403);
  assert.equal((await api(people.a, "POST", `${root}/requests/${suspendOwner.body.request.id}/cancel`)).status, 200);
  const employeeInvite = await api(people.a, "POST", `${root}/invitations`, { email: people.employee.email, role: "MEMBER" });
  assert.equal(employeeInvite.status, 201);
  assert.equal((await api(people.employee, "POST", "/api/invitations/accept", { token: tokenFrom(employeeInvite.body.acceptanceUrl) })).status, 201);
  const employeeMember = (await api(people.a, "GET", `${root}/members`)).body.members.find((member) => member.user.email === people.employee.email);
  assert.equal((await api(people.a, "PATCH", `${root}/members/${employeeMember.id}`, { status: "SUSPENDED", reason: "Annual access review" })).status, 200);
  assert.equal((await api(people.employee, "GET", `${root}/members`)).status, 404);
  assert.equal((await api(people.a, "PATCH", `${root}/members/${employeeMember.id}`, { status: "ACTIVE", reason: "Review complete" })).status, 200);

  const dUser = await db.user.findUniqueOrThrow({ where: { tideSubject: people.d.subject } });
  const remove = await api(people.a, "POST", `${root}/requests`, { operationType: "REMOVE_OWNER", idempotencyKey: key(), payload: { targetUserId: dUser.id, reason: "Owner departure" } });
  assert.equal(remove.status, 201, JSON.stringify(remove.body));
  const removalId = remove.body.request.id;
  assert.equal((await api(people.d, "POST", `${root}/requests/${removalId}/approve`)).status, 403);
  assert.equal((await api(people.b, "POST", `${root}/requests/${removalId}/approve`)).status, 201);
  assert.equal((await api(people.a, "POST", `${root}/requests/${removalId}/execute`)).status, 409);
  assert.equal((await api(people.c, "POST", `${root}/requests/${removalId}/approve`)).status, 201);
  const executions = await Promise.all([api(people.a, "POST", `${root}/requests/${removalId}/execute`), api(people.b, "POST", `${root}/requests/${removalId}/execute`)]);
  assert.deepEqual(executions.map((x) => x.status).sort(), [200, 409]);
  assert.equal(await db.execution.count({ where: { requestId: removalId, status: "SUCCEEDED" } }), 1);
  assert.equal((await api(people.d, "GET", `${root}/members`)).status, 404);
  assert.equal((await api(people.outsider, "GET", `${root}/audit`)).status, 404);

  const stale = await api(people.a, "POST", `${root}/requests`, { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: key(), payload: { email: `later-${suffix}@example.test`, role: "OWNER", reason: "Future owner" } });
  assert.equal(stale.status, 201);
  const oldPolicy = (await api(people.a, "GET", `${root}/policies`)).body.policies.find((policy) => policy.operationType === "INVITE_PRIVILEGED_MEMBER");
  const policyRequest = await api(people.a, "POST", `${root}/requests`, { operationType: "UPDATE_POLICY", idempotencyKey: key(), payload: { operationType: "INVITE_PRIVILEGED_MEMBER", requiredApprovals: 2, ttlSeconds: 3600, baseVersion: oldPolicy.version, reason: "Shorter approval period" } });
  assert.equal(policyRequest.status, 201, JSON.stringify(policyRequest.body));
  const policyId = policyRequest.body.request.id;
  await Promise.all([api(people.b, "POST", `${root}/requests/${policyId}/approve`), api(people.c, "POST", `${root}/requests/${policyId}/approve`)]);
  assert.equal((await api(people.a, "POST", `${root}/requests/${policyId}/execute`)).status, 200);
  assert.equal((await api(people.a, "GET", `${root}/requests/${stale.body.request.id}`)).body.request.status, "CANCELLED");
  assert.equal((await api(people.b, "POST", `${root}/requests/${stale.body.request.id}/approve`)).status, 409);

  const tampered = await api(people.a, "POST", `${root}/requests`, { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: key(), payload: { email: `tamper-${suffix}@example.test`, role: "OWNER", reason: "Integrity check" } });
  assert.equal(tampered.status, 201);
  await Promise.all([api(people.b, "POST", `${root}/requests/${tampered.body.request.id}/approve`), api(people.c, "POST", `${root}/requests/${tampered.body.request.id}/approve`)]);
  await db.actionRequest.update({ where: { id: tampered.body.request.id }, data: { canonicalPayload: { email: `changed-${suffix}@example.test`, role: "OWNER", reason: "Integrity check" } } });
  assert.equal((await api(people.a, "POST", `${root}/requests/${tampered.body.request.id}/execute`)).status, 409);

  const expiring = await api(people.a, "POST", `${root}/requests`, { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: key(), payload: { email: `expire-${suffix}@example.test`, role: "OWNER", reason: "Expiry check" } });
  await db.actionRequest.update({ where: { id: expiring.body.request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await api(people.b, "POST", `${root}/requests/${expiring.body.request.id}/approve`)).status, 409);
  assert.equal((await api(people.a, "GET", `${root}/requests/${expiring.body.request.id}`)).body.request.status, "EXPIRED");

  const audit = await api(people.a, "GET", `${root}/audit`);
  assert.equal(audit.status, 200);
  assert.equal(audit.body.verification.linksValid, true);
  assert.equal(audit.body.verification.currentHashesValid, true);
  assert.ok(audit.body.events.some((event) => event.action === "ACTION_EXECUTED"));
  const chronological = [...audit.body.events].reverse();
  for (let i = 1; i < chronological.length; i++) assert.equal(chronological[i].previousEventHash, chronological[i - 1].eventHash);
});

after(async () => { await db.$disconnect(); });
