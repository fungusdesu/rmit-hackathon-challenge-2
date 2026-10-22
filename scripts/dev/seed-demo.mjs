// Seeds a clean demo organization through the real APIs (development auth mode only).
// Usage: node scripts/dev/seed-demo.mjs [baseUrl]   (default http://localhost:3000)
// Idempotent: reuses an existing ACTIVE "Northstar Labs (demo)" owned by demo-alice.

const BASE = (process.argv[2] ?? process.env.DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ORG_NAME = "Northstar Labs (demo)";
const P = {
  alice: { subject: "demo-alice", name: "Alice (owner)", email: "alice@northstar.test" },
  bob: { subject: "demo-bob", name: "Bob (owner)", email: "bob@northstar.test" },
  carol: { subject: "demo-carol", name: "Carol (owner)", email: "carol@northstar.test" },
  dave: { subject: "demo-dave", name: "Dave (member)", email: "dave@northstar.test" },
  erin: { subject: "demo-erin", name: "Erin (auditor)", email: "erin@northstar.test" },
};

async function call(persona, method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-dev-user-subject": persona.subject, "x-dev-user-name": persona.name, "x-dev-user-email": persona.email },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} as ${persona.subject} -> ${response.status} ${data.error ?? ""} ${data.message ?? ""}`.trim());
  return data;
}

function step(label) { process.stdout.write(`- ${label} ... `); }
function ok(detail = "ok") { console.log(detail); }

async function main() {
  console.log(`Seeding demo data via ${BASE}`);
  const { organizations } = await call(P.alice, "GET", "/api/organizations");
  const existing = organizations.find(org => org.name === ORG_NAME && org.setupStatus === "ACTIVE");
  if (existing) {
    console.log(`Demo organization already exists (${existing.id}); nothing to do.`);
    return printNext(existing.id);
  }

  step(`create "${ORG_NAME}" as Alice`);
  const { organization } = await call(P.alice, "POST", "/api/organizations", { name: ORG_NAME, description: "Demo workspace: five people, three owners, governed changes" });
  ok(organization.id);
  const org = `/api/organizations/${organization.id}`;

  const invites = [[P.bob, "OWNER"], [P.carol, "OWNER"], [P.dave, "MEMBER"], [P.erin, "AUDITOR"]];
  for (const [persona, role] of invites) {
    step(`invite ${persona.name} as ${role} and accept`);
    const { acceptanceUrl } = await call(P.alice, "POST", `${org}/invitations`, { email: persona.email, role });
    const token = new URL(acceptanceUrl).hash.replace(/^#token=/, "");
    await call(persona, "POST", "/api/invitations/accept", { token });
    ok();
  }

  step("governance activated (3 owners)");
  const after = await call(P.alice, "GET", `${org}`);
  ok(after.organization?.setupStatus ?? "unknown");

  const assets = [
    { name: "github.com/northstar-labs", type: "GITHUB_ORG", provider: "GITHUB", criticality: "HIGH", businessOwner: "Alice", reviewDate: "2026-12-01" },
    { name: "AWS root account (prod)", type: "CLOUD_ACCOUNT", provider: "AWS", criticality: "CRITICAL", businessOwner: "Bob", reviewDate: "2026-09-01" },
    { name: "northstar.example domain", type: "DOMAIN", provider: "CLOUDFLARE", criticality: "MEDIUM", businessOwner: "Carol", reviewDate: "2027-03-01" },
  ];
  for (const asset of assets) {
    step(`asset "${asset.name}"`);
    await call(P.alice, "POST", `${org}/assets`, asset);
    ok();
  }

  step("Bob requests to invite Frank as ADMIN (needs owner quorum)");
  try {
    const { request } = await call(P.bob, "POST", `${org}/requests`, {
      operationType: "INVITE_PRIVILEGED_MEMBER",
      idempotencyKey: `demo-${Date.now()}`,
      payload: { email: "frank@northstar.test", role: "ADMIN", reason: "Frank joins as security administrator" },
    });
    ok(`${request.id} (${request.status})`);
  } catch (error) {
    ok(`skipped: ${error.message}`);
  }

  printNext(organization.id);
}

function printNext(organizationId) {
  console.log(`\nDemo organization: ${organizationId}`);
  console.log(`Open ${BASE}/dashboard and use "DEV · acting as" in the header:`);
  console.log("  Alice (owner)   -> approve Bob's request in Approvals, manage assets and members");
  console.log("  Bob (owner)     -> sees his own request (cannot self-approve)");
  console.log("  Erin (auditor)  -> read-only: audit log, verify chain, export");
  console.log("  Mallory         -> outsider: sees no organization");
}

main().catch(error => { console.error(`\nSeed failed: ${error.message}`); process.exit(1); });
