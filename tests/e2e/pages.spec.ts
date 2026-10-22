import { expect, test, type Page } from "@playwright/test";

// Smoke coverage for every dashboard module in development auth mode (default dev subject).
// The browser and the API context both act as DEV_AUTH_SUBJECT, so they see the same organizations.

const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/dashboard", heading: /Needs your attention|Create your first organization/i },
  { path: "/dashboard/approvals", heading: /Approvals inbox/i },
  { path: "/dashboard/requests", heading: /My requests/i },
  { path: "/dashboard/members", heading: /Members & owners/i },
  { path: "/dashboard/vault", heading: /Vault/i },
  { path: "/dashboard/assets", heading: /Asset registry/i },
  { path: "/dashboard/audit", heading: /Audit log/i },
  { path: "/dashboard/settings", heading: /Security settings/i },
];

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

let organizationId = "";
const assetName = `E2E asset ${Date.now()}`;

test.describe.serial("Dashboard modules (development mode)", () => {
  test.beforeAll(async ({ request }) => {
    const list = await request.get("/api/organizations");
    expect(list.ok()).toBeTruthy();
    const { organizations } = (await list.json()) as { organizations: { id: string }[] };
    if (organizations.length === 0) {
      const created = await request.post("/api/organizations", { data: { name: "E2E Workspace", description: "playwright" } });
      expect(created.status()).toBe(201);
      organizationId = ((await created.json()) as { organization: { id: string } }).organization.id;
    } else {
      organizationId = organizations[0].id;
    }
  });

  for (const { path, heading } of PAGES) {
    test(`renders ${path}`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 30_000 });
      expect(errors, `page errors on ${path}`).toEqual([]);
    });
  }

  test("asset created via API shows in the registry and the audit log verifies", async ({ page, request }) => {
    // Fresh organization so the audit chain contains only events written by the current code.
    const org = await request.post("/api/organizations", { data: { name: `E2E Assets ${Date.now()}`, description: "playwright" } });
    expect(org.status()).toBe(201);
    const freshOrgId = ((await org.json()) as { organization: { id: string } }).organization.id;
    const created = await request.post(`/api/organizations/${freshOrgId}/assets`, {
      data: { name: assetName, type: "GITHUB_ORG", provider: "GITHUB", criticality: "HIGH" },
    });
    expect(created.status()).toBe(201);

    // The workspace remembers the selected organization in sessionStorage.
    await page.addInitScript((id) => window.sessionStorage.setItem("businessvault-organization", id), freshOrgId);
    await page.goto("/dashboard/assets");
    await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Inventory only/i).first()).toBeVisible();

    await page.goto("/dashboard/audit");
    // The action name also appears as a hidden <option> in the filter, so target the table cell.
    await expect(page.getByRole("cell", { name: /ASSET_CREATED/ }).first()).toBeVisible({ timeout: 30_000 });

    const verify = await request.get(`/api/organizations/${freshOrgId}/audit/verify`);
    expect(verify.ok()).toBeTruthy();
    const result = (await verify.json()) as { ok?: boolean; result?: { ok: boolean } };
    expect(result.ok ?? result.result?.ok).toBe(true);
  });

  test("initializing organization locks governed actions instead of failing with 409", async ({ page, request }) => {
    // A fresh organization has one owner, so governance stays INITIALIZING until 3 founding owners join.
    const org = await request.post("/api/organizations", { data: { name: `E2E Setup ${Date.now()}`, description: "playwright" } });
    expect(org.status()).toBe(201);
    const freshOrgId = ((await org.json()) as { organization: { id: string } }).organization.id;

    // The server rule is unchanged: governed requests are still rejected.
    const rejected = await request.post(`/api/organizations/${freshOrgId}/requests`, {
      data: { operationType: "INVITE_PRIVILEGED_MEMBER", idempotencyKey: `e2e-${Date.now()}`, payload: { email: "admin@example.com", role: "ADMIN", reason: "e2e lock check" } },
    });
    expect(rejected.status()).toBe(409);
    expect(((await rejected.json()) as { error: string }).error).toBe("governance_not_active");

    await page.addInitScript((id) => window.sessionStorage.setItem("businessvault-organization", id), freshOrgId);
    await page.goto("/dashboard/members");
    await expect(page.getByText(/1 of 3 founding owners have joined/).first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/dashboard/requests");
    await expect(page.getByRole("button", { name: /Locked until governance is active/ })).toBeDisabled({ timeout: 30_000 });

    await page.goto("/dashboard/settings");
    await expect(page.getByRole("button", { name: /Locked until governance is active/ })).toBeDisabled({ timeout: 30_000 });
  });

  test("settings shows integration health from the server", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: /Integration health/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/APP-LEVEL APPROVAL ONLY/i).first()).toBeVisible();
  });

  test("no horizontal scroll at phone width on any module", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    for (const { path, heading } of PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible({ timeout: 30_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
    await context.close();
  });
});
