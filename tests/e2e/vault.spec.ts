import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type CapturedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string | null;
  postDataBuffer: Buffer | null;
};

test.describe.serial("Vault browser E2E flow (development mode)", () => {
  let orgId = "";
  let orgName = "";
  const canary = `E2ECANARY-${randomUUID()}`;
  const fileName = `${canary}-report.txt`;
  const plaintext = `Quarterly secrets ${canary}`;
  const capturedRequests: CapturedRequest[] = [];

  let sharedContext: BrowserContext;
  let sharedPage: Page;

  test.beforeAll(async ({ browser, request }) => {
    orgName = `E2E ${Date.now()}`;
    const res = await request.post("/api/organizations", {
      headers: {
        "content-type": "application/json",
        "x-dev-user-subject": "dev-alice",
        "x-dev-user-name": "Alice (dev)",
      },
      data: {
        name: orgName,
        description: "e2e",
      },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { organization?: { id: string }; id?: string };
    orgId = body.organization?.id ?? body.id ?? "";
    expect(orgId.length).toBeGreaterThan(0);

    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();
    sharedPage.on("request", (req) => {
      capturedRequests.push({
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
        postData: req.postData(),
        postDataBuffer: req.postDataBuffer(),
      });
    });
  });

  test.afterAll(async () => {
    await sharedContext?.close();
  });

  test("1. Demo labelling", async () => {
    await sharedPage.goto("/dashboard/vault");
    await expect(
      sharedPage.getByRole("alert").filter({ hasText: /DEMO\s*[—-]\s*NOT END-TO-END ENCRYPTED/i }),
    ).toBeVisible();
    await expect(sharedPage.getByText(/Only the uploader can decrypt/i)).toBeVisible();
  });

  test("2. Upload round trip as Alice", async () => {
    await sharedPage.goto("/dashboard/vault");
    await sharedPage.getByLabel(/Acting as/i).selectOption("dev-alice");
    const orgSelect = sharedPage.getByLabel(/Organization/i);
    await expect(orgSelect.locator("option", { hasText: orgName })).toHaveCount(1);
    await orgSelect.selectOption(orgId);

    capturedRequests.length = 0;

    await sharedPage.getByLabel(/File/i).setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(plaintext, "utf8"),
    });

    await sharedPage.getByRole("button", { name: /Encrypt\s*&\s*upload/i }).click();

    await expect(sharedPage.getByRole("status").filter({ hasText: /Uploaded/i })).toBeVisible();

    const row = sharedPage.getByRole("row").filter({ hasText: /Alice \(dev\)/i }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Encrypted name/i);
    await expect(row).toContainText(/available/i);
    await expect(row).toContainText(/Alice \(dev\)/i);
  });

  test("3. No plaintext leaves the browser", async () => {
    expect(capturedRequests.length).toBeGreaterThan(0);

    const appRequests = capturedRequests.filter((r) => r.url.includes("localhost:3200"));
    expect(appRequests.length).toBeGreaterThan(0);
    for (const req of appRequests) {
      expect(req.url).not.toContain(canary);
      expect(req.postData ?? "").not.toContain(canary);
      if (req.postDataBuffer) {
        expect(req.postDataBuffer.includes(Buffer.from(canary, "utf8"))).toBe(false);
      }
    }

    const minioRequests = capturedRequests.filter((r) => r.url.includes("localhost:9000"));
    expect(minioRequests.length).toBeGreaterThan(0);
    for (const req of minioRequests) {
      expect(req.headers["authorization"]).toBeUndefined();
      expect(req.url).not.toContain(canary);
      expect(req.postData ?? "").not.toContain(canary);
      if (req.postDataBuffer) {
        expect(req.postDataBuffer.includes(Buffer.from(canary, "utf8"))).toBe(false);
      }
    }
  });

  test("4. Decrypt in browser", async () => {
    const row = sharedPage.getByRole("row").filter({ hasText: /Alice \(dev\)/i }).first();
    await row.getByRole("button", { name: /Decrypt name/i }).click();
    await expect(row).toContainText(fileName);

    const downloadPromise = sharedPage.waitForEvent("download");
    await row.getByRole("button", { name: /Decrypt\s*&\s*save/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(fileName);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const downloadedText = readFileSync(downloadPath!, "utf8");
    expect(downloadedText).toBe(plaintext);
  });

  test("5. Unauthorized user", async ({ request }) => {
    await sharedPage.goto("/dashboard/vault");
    await sharedPage.getByLabel(/Acting as/i).selectOption("dev-bob");

    const orgSelect = sharedPage.getByLabel(/Organization/i);
    await expect(orgSelect.locator("option", { hasText: orgName })).toHaveCount(0);
    await expect(sharedPage.getByRole("row").filter({ hasText: fileName })).toHaveCount(0);

    const res = await request.get(`/api/organizations/${encodeURIComponent(orgId)}/documents`, {
      headers: {
        "x-dev-user-subject": "dev-bob",
        "x-dev-user-name": "Bob (dev)",
      },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  test("6. Mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard/vault");
    await expect(
      page.getByRole("alert").filter({ hasText: /DEMO\s*[—-]\s*NOT END-TO-END ENCRYPTED/i }),
    ).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1);

    const artifactsDir = join(process.cwd(), "tests", "e2e", "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    await page.screenshot({ path: join(artifactsDir, "vault-mobile.png"), fullPage: true });
  });

  test("7. Diagnostics in dev mode", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto("/dashboard/vault/diagnostics");
    await expect(page.getByRole("status")).toContainText(/Diagnostics unavailable/i);
    await expect(page.getByRole("status")).toContainText(/tidecloak/i);
    expect(pageErrors).toEqual([]);
  });
});
