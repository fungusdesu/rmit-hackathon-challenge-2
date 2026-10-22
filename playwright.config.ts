import { defineConfig, devices } from "@playwright/test";

// Set E2E_BASE_URL (e.g. http://localhost:3000) to test an already-running dev-auth server:
// Next.js refuses a second `next dev` in the same directory.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/artifacts/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3200",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: "npx next dev -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      AUTH_MODE: "development",
      NEXT_PUBLIC_AUTH_MODE: "development",
      ALLOW_INSECURE_DEV_AUTH: "true",
      DEV_AUTH_SUBJECT: "local-owner",
      DATABASE_URL: "postgresql://businessvault:businessvault@localhost:5432/businessvault",
      S3_ENDPOINT: "http://localhost:9000",
      S3_PUBLIC_ENDPOINT: "http://localhost:9000",
      S3_BUCKET: "businessvault",
      S3_ACCESS_KEY_ID: "businessvault",
      S3_SECRET_ACCESS_KEY: "businessvault-secret",
      S3_REGION: "us-east-1",
    },
  },
});
